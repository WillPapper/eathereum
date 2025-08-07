use alloy_consensus::{EthereumTxEnvelope, Transaction};
use alloy_eips::eip2718::Typed2718;
use alloy_primitives::{Address, BlockNumber, U256, Bytes};
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
use std::ops::RangeInclusive;

/// The ExEx that processes blockchain data for stablecoin visualization
struct StablecoinVisualizerExEx<Node: FullNodeComponents> {
    /// The context of the ExEx
    ctx: ExExContext<Node>,
    /// Factory for backfill jobs
    backfill_job_factory: BackfillJobFactory<Node::Evm, Node::Provider>,
}

/// ERC-20 Transfer event data
#[derive(Debug)]
struct Erc20Transfer {
    from: Address,
    to: Address,
    amount: U256,
    token: Address,
}

/// Format token amount with proper decimals
fn format_token_amount(amount: U256, token_name: &str) -> String {
    // Most stablecoins use different decimals
    let decimals = match token_name {
        "USDT" => 6,  // Tether uses 6 decimals
        "USDC" => 6,  // USD Coin uses 6 decimals
        "DAI" => 18,  // DAI uses 18 decimals
        _ => 18,
    };
    
    // Convert to decimal representation
    let divisor = U256::from(10).pow(U256::from(decimals));
    let whole = amount / divisor;
    let fraction = amount % divisor;
    
    // Format with decimals
    if decimals == 6 {
        format!("{}.{:06}", whole, fraction)
    } else {
        format!("{}.{:018}", whole, fraction)
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
        // ERC-20 transfer function selector
        const TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];
        
        // Check if input is long enough and starts with transfer selector
        if input.len() >= 68 && input[0..4] == TRANSFER_SELECTOR {
            // Extract recipient address (bytes 4-36, padded to 32 bytes)
            let to_bytes = &input[16..36]; // Skip padding, get 20 bytes of address
            let to = Address::from_slice(to_bytes);
            
            // Extract amount (bytes 36-68)
            let amount_bytes = &input[36..68];
            let amount = U256::from_be_slice(amount_bytes);
            
            return Some(Erc20Transfer {
                from,
                to,
                amount,
                token,
            });
        }
        None
    }
    
    /// Parse ERC-20 transferFrom function call from input data
    /// transferFrom(address,address,uint256) - 0x23b872dd
    fn parse_erc20_transfer_from(input: &Bytes, token: Address) -> Option<Erc20Transfer> {
        // ERC-20 transferFrom function selector
        const TRANSFER_FROM_SELECTOR: [u8; 4] = [0x23, 0xb8, 0x72, 0xdd];
        
        // Check if input is long enough and starts with transferFrom selector
        if input.len() >= 100 && input[0..4] == TRANSFER_FROM_SELECTOR {
            // Extract from address (bytes 4-36, padded to 32 bytes)
            let from_bytes = &input[16..36]; // Skip padding, get 20 bytes of address
            let from = Address::from_slice(from_bytes);
            
            // Extract to address (bytes 36-68, padded to 32 bytes)
            let to_bytes = &input[48..68]; // Skip padding, get 20 bytes of address
            let to = Address::from_slice(to_bytes);
            
            // Extract amount (bytes 68-100)
            let amount_bytes = &input[68..100];
            let amount = U256::from_be_slice(amount_bytes);
            
            return Some(Erc20Transfer {
                from,
                to,
                amount,
                token,
            });
        }
        None
    }
    
    /// Check if an address is a known stablecoin
    fn is_stablecoin(address: &Address) -> Option<&'static str> {
        // Convert address to lowercase hex string for comparison
        let addr_hex = format!("{:?}", address).to_lowercase();
        
        // Known stablecoin addresses on Ethereum mainnet
        if addr_hex.contains("dac17f958d2ee523a2206206994597c13d831ec7") {
            Some("USDT")
        } else if addr_hex.contains("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48") {
            Some("USDC")
        } else if addr_hex.contains("6b175474e89094c44da98b954eedeac495271d0f") {
            Some("DAI")
        } else {
            None
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

            // Loop through all transactions in the block
            // We need to access transactions and senders separately
            let transactions: Vec<_> = block.body().transactions().collect();
            
            // Each transaction should have a corresponding sender
            for (tx_index, transaction) in transactions.iter().enumerate() {
                // Get transaction hash for identification
                let tx_hash = transaction.hash();
                
                // Get the sender - blocks have recovered senders
                let sender = block.senders()
                    .get(tx_index)
                    .copied()
                    .unwrap_or_default();
                
                // Extract transaction data - we need to match on the envelope variant
                let tx_type = transaction.ty();
                
                // Extract to, value, and input based on transaction type
                // The transaction envelope contains different variants for different transaction types
                let (to, value, input) = match transaction {
                    EthereumTxEnvelope::Legacy(tx) => {
                        (tx.tx().to(), tx.tx().value(), tx.tx().input())
                    }
                    EthereumTxEnvelope::Eip2930(tx) => {
                        (tx.tx().to(), tx.tx().value(), tx.tx().input())
                    }
                    EthereumTxEnvelope::Eip1559(tx) => {
                        (tx.tx().to(), tx.tx().value(), tx.tx().input())
                    }
                    EthereumTxEnvelope::Eip4844(tx) => {
                        (tx.tx().to(), tx.tx().value(), tx.tx().input())
                    }
                    _ => {
                        // Other transaction types we might not handle yet
                        (None, U256::ZERO, &Bytes::new())
                    }
                };
                
                // Log full transaction details
                info!(
                    block = %block_number,
                    tx_index = %tx_index,
                    tx_hash = ?tx_hash,
                    from = ?sender,
                    to = ?to,
                    value = ?value,
                    input_len = %input.len(),
                    input_first_4_bytes = ?input.get(0..4).map(|b| format!("0x{}", hex::encode(b))),
                    tx_type = %tx_type,
                    "Processing transaction with full data"
                );
                
                // TODO: Parse transaction input data to identify stablecoin operations
                // Common ERC20 function selectors (first 4 bytes of input):
                // - 0xa9059cbb: transfer(address,uint256)
                // - 0x23b872dd: transferFrom(address,address,uint256)
                // - 0x095ea7b3: approve(address,uint256)
                // - 0x70a08231: balanceOf(address)
                // - 0x18160ddd: totalSupply()
                
                // Check if this is a stablecoin transaction and parse transfer data
                if let Some(to_addr) = to {
                    if let Some(stablecoin_name) = Self::is_stablecoin(&to_addr) {
                        // Try to parse as ERC-20 transfer
                        if let Some(transfer) = Self::parse_erc20_transfer(input, sender, to_addr) {
                            info!(
                                block = %block_number,
                                tx_hash = ?tx_hash,
                                stablecoin = %stablecoin_name,
                                from = ?transfer.from,
                                to = ?transfer.to,
                                amount = ?transfer.amount,
                                amount_decimal = ?format_token_amount(transfer.amount, stablecoin_name),
                                "Found {} transfer", stablecoin_name
                            );
                        }
                        // Try to parse as ERC-20 transferFrom
                        else if let Some(transfer) = Self::parse_erc20_transfer_from(input, to_addr) {
                            info!(
                                block = %block_number,
                                tx_hash = ?tx_hash,
                                stablecoin = %stablecoin_name,
                                from = ?transfer.from,
                                to = ?transfer.to,
                                amount = ?transfer.amount,
                                amount_decimal = ?format_token_amount(transfer.amount, stablecoin_name),
                                "Found {} transferFrom", stablecoin_name
                            );
                        }
                    }
                }
                
                // Access transaction receipts from the execution outcome for event logs
                // The execution outcome contains receipts for each block
                // Note: receipts are grouped by block, not individual transactions
                
                // TODO: Access the execution outcome properly to get:
                // - Transaction receipts with logs
                // - Extract logs from receipts to identify ERC20 events
                // - Transfer events (topic0: 0xddf252ad...)
                // - Approval events
                // - Mint/Burn events for stablecoins
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