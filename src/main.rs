use alloy_consensus::{EthereumTxEnvelope, Transaction};
use alloy_eips::eip2718::Typed2718;
use alloy_primitives::{address, Address, BlockNumber, U256, Bytes};
use clap::{Args, Parser};
use eyre::OptionExt;
use futures::{FutureExt, StreamExt};
use reth_ethereum::{
    node::api::NodeTypes,
    provider::BlockIdReader,
    rpc::eth::primitives::{BlockId, BlockNumberOrTag},
    EthPrimitives,
};
use reth_ethereum_cli::chainspec::EthereumChainSpecParser;
use reth_execution_types::Chain;
use reth_exex::{BackfillJobFactory, ExExContext, ExExEvent, ExExNotification};
use reth_node_api::FullNodeComponents;
use reth_node_ethereum::EthereumNode;
use reth_tracing::tracing::{error, info};
use std::{collections::HashMap, ops::RangeInclusive};
use once_cell::sync::Lazy;

/// Known stablecoin addresses on Ethereum mainnet
static STABLECOIN_ADDRESSES: Lazy<HashMap<Address, StablecoinInfo>> = Lazy::new(|| {
    HashMap::from([
        (
            address!("dac17f958d2ee523a2206206994597c13d831ec7"),
            StablecoinInfo { name: "USDT", decimals: 6 },
        ),
        (
            address!("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
            StablecoinInfo { name: "USDC", decimals: 6 },
        ),
        (
            address!("6b175474e89094c44da98b954eedeac495271d0f"),
            StablecoinInfo { name: "DAI", decimals: 18 },
        ),
    ])
});

/// ERC-20 function selectors
mod selectors {
    pub const TRANSFER: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];
    pub const TRANSFER_FROM: [u8; 4] = [0x23, 0xb8, 0x72, 0xdd];
    pub const APPROVE: [u8; 4] = [0x09, 0x5e, 0xa7, 0xb3];
    pub const BALANCE_OF: [u8; 4] = [0x70, 0xa0, 0x82, 0x31];
    pub const TOTAL_SUPPLY: [u8; 4] = [0x18, 0x16, 0x0d, 0xdd];
}

/// A newtype wrapper for function selectors for better type safety
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FunctionSelector([u8; 4]);

impl FunctionSelector {
    const TRANSFER: Self = Self(selectors::TRANSFER);
    const TRANSFER_FROM: Self = Self(selectors::TRANSFER_FROM);
    
    /// Extract function selector from input bytes
    fn from_input(input: &Bytes) -> Option<Self> {
        input.get(0..4)
            .and_then(|bytes| bytes.try_into().ok())
            .map(Self)
    }
    
    /// Check if input starts with this selector
    fn matches(&self, input: &Bytes) -> bool {
        input.starts_with(&self.0)
    }
}

/// Stablecoin metadata
#[derive(Debug, Clone, Copy)]
struct StablecoinInfo {
    name: &'static str,
    decimals: u8,
}

/// The ExEx that processes blockchain data for stablecoin visualization
struct StablecoinVisualizerExEx<Node: FullNodeComponents> {
    /// The context of the ExEx
    ctx: ExExContext<Node>,
    /// Factory for backfill jobs
    backfill_job_factory: BackfillJobFactory<Node::Evm, Node::Provider>,
}

/// ERC-20 Transfer event data
#[derive(Debug, Clone)]
struct Erc20Transfer {
    from: Address,
    to: Address,
    amount: U256,
    token: Address,
}

/// Format token amount with proper decimals
fn format_token_amount(amount: U256, decimals: u8) -> String {
    // Convert to decimal representation
    let divisor = U256::from(10).pow(U256::from(decimals));
    let whole = amount / divisor;
    let fraction = amount % divisor;
    
    // Format with appropriate decimal places
    match decimals {
        6 => format!("{}.{:06}", whole, fraction),
        18 => format!("{}.{:018}", whole, fraction),
        n => {
            // Handle arbitrary decimal places
            let fraction_str = format!("{:0width$}", fraction, width = n as usize);
            format!("{}.{}", whole, fraction_str)
        }
    }
}

/// Extract transaction data from any transaction envelope variant
fn extract_tx_data(envelope: &EthereumTxEnvelope) -> (Option<Address>, U256, &Bytes) {
    use EthereumTxEnvelope::*;
    
    match envelope {
        Legacy(tx) | Eip2930(tx) => {
            let inner = tx.tx();
            (inner.to(), inner.value(), inner.input())
        }
        Eip1559(tx) => {
            let inner = tx.tx();
            (inner.to(), inner.value(), inner.input())
        }
        Eip4844(tx) => {
            let inner = tx.tx();
            (inner.to(), inner.value(), inner.input())
        }
        _ => (None, U256::ZERO, &Bytes::new()),
    }
}

impl<Node> StablecoinVisualizerExEx<Node>
where
    Node: FullNodeComponents<Types: NodeTypes<Primitives = EthPrimitives>>,
{
    /// Creates a new instance of the ExEx
    fn new(ctx: ExExContext<Node>) -> Self {
        let backfill_job_factory =
            BackfillJobFactory::new(ctx.evm_config().clone(), ctx.provider().clone());
        Self {
            ctx,
            backfill_job_factory,
        }
    }
    
    /// Parse ERC-20 transfer function call from input data
    /// transfer(address,uint256) - 0xa9059cbb
    fn parse_erc20_transfer(input: &Bytes, from: Address, token: Address) -> Option<Erc20Transfer> {
        // Minimum required length: 4 (selector) + 32 (address) + 32 (amount) = 68
        if input.len() < 68 {
            return None;
        }
        
        // Check function selector
        if !FunctionSelector::TRANSFER.matches(input) {
            return None;
        }
        
        // Extract recipient address (bytes 16-36, skipping 12 bytes of padding)
        let to = Address::from_slice(
            input.get(16..36)?
        );
        
        // Extract amount (bytes 36-68)
        let amount = U256::from_be_slice(
            input.get(36..68)?
        );
        
        Some(Erc20Transfer {
            from,
            to,
            amount,
            token,
        })
    }
    
    /// Parse ERC-20 transferFrom function call from input data
    /// transferFrom(address,address,uint256) - 0x23b872dd
    fn parse_erc20_transfer_from(input: &Bytes, token: Address) -> Option<Erc20Transfer> {
        // Minimum required length: 4 (selector) + 32 (from) + 32 (to) + 32 (amount) = 100
        if input.len() < 100 {
            return None;
        }
        
        // Check function selector
        if !FunctionSelector::TRANSFER_FROM.matches(input) {
            return None;
        }
        
        // Extract from address (bytes 16-36, skipping 12 bytes of padding)
        let from = Address::from_slice(
            input.get(16..36)?
        );
        
        // Extract to address (bytes 48-68, skipping 12 bytes of padding)
        let to = Address::from_slice(
            input.get(48..68)?
        );
        
        // Extract amount (bytes 68-100)
        let amount = U256::from_be_slice(
            input.get(68..100)?
        );
        
        Some(Erc20Transfer {
            from,
            to,
            amount,
            token,
        })
    }
    
    /// Check if an address is a known stablecoin and return its info
    fn get_stablecoin_info(address: &Address) -> Option<&'static StablecoinInfo> {
        STABLECOIN_ADDRESSES.get(address)
    }
    
    /// Process a potential stablecoin transaction
    fn process_stablecoin_transaction(
        &self,
        block_number: BlockNumber,
        tx_hash: alloy_primitives::TxHash,
        token_address: Address,
        sender: Address,
        input: &Bytes,
    ) {
        let Some(stablecoin_info) = Self::get_stablecoin_info(&token_address) else {
            return;
        };
        
        // Try to parse as ERC-20 transfer or transferFrom
        let transfer = Self::parse_erc20_transfer(input, sender, token_address)
            .or_else(|| Self::parse_erc20_transfer_from(input, token_address));
        
        if let Some(transfer) = transfer {
            let function_type = if FunctionSelector::TRANSFER.matches(input) {
                "transfer"
            } else {
                "transferFrom"
            };
            
            info!(
                block = %block_number,
                tx_hash = ?tx_hash,
                stablecoin = %stablecoin_info.name,
                from = ?transfer.from,
                to = ?transfer.to,
                amount = ?transfer.amount,
                amount_decimal = ?format_token_amount(transfer.amount, stablecoin_info.decimals),
                "Found {} {}", stablecoin_info.name, function_type
            );
        }
    }

    /// Starts listening for notifications
    async fn start(mut self) -> eyre::Result<()> {
        info!("Starting Stablecoin Visualizer ExEx");
        
        loop {
            match self.ctx.notifications.next().await {
                Some(notification) => {
                    self.handle_notification(notification?).await?;
                }
                None => {
                    error!("Notification stream ended");
                    break;
                }
            }
        }
        
        Ok(())
    }

    /// Handles the given notification and processes committed chains
    async fn handle_notification(&mut self, notification: ExExNotification) -> eyre::Result<()> {
        match &notification {
            ExExNotification::ChainCommitted { new } => {
                info!(committed_chain = ?new.range(), "Received commit");
            }
            ExExNotification::ChainReorged { old, new } => {
                info!(from_chain = ?old.range(), to_chain = ?new.range(), "Received reorg");
            }
            ExExNotification::ChainReverted { old } => {
                info!(reverted_chain = ?old.range(), "Received revert");
            }
        };

        if let Some(committed_chain) = notification.committed_chain() {
            self.process_committed_chain(&committed_chain)?;
            self.ctx.events.send(ExExEvent::FinishedHeight(committed_chain.tip().num_hash()))?;
        }

        Ok(())
    }


    /// Processes the committed chain for stablecoin data
    fn process_committed_chain(&self, chain: &Chain) -> eyre::Result<()> {
        let blocks = chain.blocks().len();
        let total_transactions =
            chain.blocks().values().map(|block| block.transaction_count()).sum::<usize>();

        info!(
            first_block = %chain.execution_outcome().first_block,
            %blocks,
            %total_transactions,
            "Processing blocks for stablecoin data"
        );

        // Loop through all blocks in the chain
        for (block_number, block) in chain.blocks() {
            info!(
                block_number = %block_number,
                tx_count = %block.transaction_count(),
                "Processing block"
            );

            // Process all transactions in the block
            let transactions: Vec<_> = block.body().transactions().collect();
            let senders = block.senders();
            
            // Ensure we have matching senders for all transactions
            if transactions.len() != senders.len() {
                error!(
                    block = %block_number,
                    tx_count = %transactions.len(),
                    sender_count = %senders.len(),
                    "Transaction and sender count mismatch"
                );
                continue;
            }
            
            // Process each transaction with its corresponding sender
            for (transaction, &sender) in transactions.iter().zip(senders.iter()) {
                // Get transaction hash for identification
                let tx_hash = transaction.hash();
                
                // Extract transaction data - we need to match on the envelope variant
                let tx_type = transaction.ty();
                
                // Extract transaction data using a helper function
                let (to, value, input) = extract_tx_data(transaction);
                
                // Log transaction details for debugging
                info!(
                    block = %block_number,
                    tx_hash = ?tx_hash,
                    from = ?sender,
                    to = ?to,
                    value = ?value,
                    input_len = %input.len(),
                    input_selector = ?input.get(0..4).map(|b| format!("0x{}", hex::encode(b))),
                    tx_type = %tx_type,
                    "Processing transaction"
                );
                
                // Process potential stablecoin transaction
                if let Some(to_addr) = to {
                    self.process_stablecoin_transaction(
                        block_number,
                        tx_hash,
                        to_addr,
                        sender,
                        input,
                    );
                }
            }
        }

        Ok(())
    }

    /// Performs a backfill for historical data
    async fn backfill(&self, range: RangeInclusive<BlockNumber>) -> eyre::Result<()> {
        info!(?range, "Starting backfill");

        let job = self.backfill_job_factory.backfill(range);
        
        let mut stream = job.into_stream();
        while let Some(chain) = stream.next().await {
            let chain = chain?;
            self.process_committed_chain(&chain)?;
        }

        info!("Backfill completed");
        Ok(())
    }
}

#[derive(Debug, Clone, Args)]
struct StablecoinVisualizerArgs {
    /// Start backfill from the specified block number
    #[clap(long = "backfill-from-block")]
    pub from_block: Option<u64>,

    /// Stop backfill at the specified block number
    #[clap(long = "backfill-to-block")]
    pub to_block: Option<BlockId>,
}

fn main() -> eyre::Result<()> {
    reth::cli::Cli::<EthereumChainSpecParser, StablecoinVisualizerArgs>::parse().run(
        |builder, args| async move {
            let handle = builder
                .node(EthereumNode::default())
                .install_exex("StablecoinVisualizer", move |ctx| {
                    // Using spawn_blocking to avoid higher-ranked lifetime errors with async closures
                    tokio::task::spawn_blocking(move || {
                        tokio::runtime::Handle::current().block_on(async move {
                            let exex = StablecoinVisualizerExEx::new(ctx);

                            // Perform initial backfill if requested
                            if let Some(from_block) = args.from_block {
                                let to_block = if let Some(to_block) = args.to_block {
                                    exex.ctx.provider().block_number_for_id(to_block)?
                                        .ok_or_eyre("End block not found")?
                                } else {
                                    exex.ctx.provider().block_number_for_id(BlockNumberOrTag::Latest.into())?
                                        .ok_or_eyre("Latest block not found")?
                                };

                                exex.backfill(from_block..=to_block).await?;
                            }

                            eyre::Ok(exex.start())
                        })
                    })
                    .then(|result| async move { result.map_err(Into::into).and_then(|result| result) })
                })
                .launch()
                .await?;

            handle.wait_for_node_exit().await
        },
    )
}