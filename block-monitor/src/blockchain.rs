use alloy::{
    primitives::{Address, FixedBytes, U256},
    providers::Provider,
    rpc::types::Filter,
};
use eyre::Result;
use std::collections::HashMap;
use tracing::{info, warn};

use crate::config::{StablecoinInfo, DAI_ADDRESS, USDC_ADDRESS, USDT_ADDRESS};
use crate::transaction::TransactionData;

pub const TRANSFER_EVENT_SIGNATURE: FixedBytes<32> = FixedBytes::new([
    0xdd, 0xf2, 0x52, 0xad, 0x1b, 0xe2, 0xc8, 0x9b, 0x69, 0xc2, 0xb0, 0x68, 0xfc, 0x37, 0x8d, 0xaa,
    0x95, 0x2b, 0xa7, 0xf1, 0x63, 0xc4, 0xa1, 0x16, 0x28, 0xf5, 0x5a, 0x4d, 0xf5, 0x23, 0xb3, 0xef,
]);

pub struct BlockchainMonitor {
    provider: Box<dyn Provider>,
    stablecoins: HashMap<Address, StablecoinInfo>,
}

impl BlockchainMonitor {
    pub fn new(provider: Box<dyn Provider>, stablecoins: HashMap<Address, StablecoinInfo>) -> Self {
        Self {
            provider,
            stablecoins,
        }
    }

    pub async fn get_current_block(&self) -> Result<u64> {
        Ok(self.provider.get_block_number().await?)
    }

    pub async fn process_block(&self, block_number: u64) -> Result<Vec<TransactionData>> {
        let filter = Filter::new()
            .from_block(block_number)
            .to_block(block_number)
            .address(vec![USDC_ADDRESS, USDT_ADDRESS, DAI_ADDRESS])
            .event_signature(vec![TRANSFER_EVENT_SIGNATURE]);

        let logs = match self.provider.get_logs(&filter).await {
            Ok(logs) => logs,
            Err(e) => {
                if e.to_string().contains("deserialization")
                    || e.to_string().contains("BlockTransactions")
                {
                    warn!("RPC provider returned invalid block data for block {}. This is likely an RPC issue.", block_number);
                    return Ok(vec![]);
                }
                return Err(e.into());
            }
        };

        let mut transactions = Vec::new();

        for log in logs {
            if let Some(stablecoin_info) = self.stablecoins.get(&log.address()) {
                if log.topics().len() >= 3 && log.data().data.len() >= 32 {
                    let from_bytes: &[u8] = log.topics()[1].as_ref();
                    let to_bytes: &[u8] = log.topics()[2].as_ref();
                    let from = Address::from_slice(&from_bytes[12..]);
                    let to = Address::from_slice(&to_bytes[12..]);
                    let amount = U256::from_be_slice(&log.data().data);

                    let tx_data = TransactionData {
                        stablecoin: stablecoin_info.name.to_string(),
                        amount: format_amount(amount, stablecoin_info.decimals),
                        from: format!("{:?}", from),
                        to: format!("{:?}", to),
                        block_number,
                        tx_hash: format!("{:#x}", log.transaction_hash.unwrap_or_default()),
                    };

                    info!(
                        "Found {} transfer: from={} to={} amount={} tx_hash={} block={}",
                        tx_data.stablecoin,
                        tx_data.from,
                        tx_data.to,
                        tx_data.amount,
                        tx_data.tx_hash,
                        tx_data.block_number
                    );

                    transactions.push(tx_data);
                }
            }
        }

        Ok(transactions)
    }
}

fn format_amount(amount: U256, decimals: u8) -> String {
    let divisor = U256::from(10).pow(U256::from(decimals));
    let whole = amount / divisor;
    let fraction = amount % divisor;

    match decimals {
        6 => format!("{}.{:06}", whole, fraction),
        18 => format!("{}.{:018}", whole, fraction),
        n => {
            let fraction_str = format!("{:0width$}", fraction, width = n as usize);
            format!("{}.{}", whole, fraction_str)
        }
    }
}
