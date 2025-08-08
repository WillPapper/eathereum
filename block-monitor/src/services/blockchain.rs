use crate::{
    config::ChainConfig,
    domain::{Token, TokenRegistry, Transaction},
    error::{MonitorError, Result},
};
use alloy::{
    primitives::{address, Address, TxHash, U256},
    providers::{Provider, RootProvider},
    rpc::types::{BlockTransactionsKind, Filter, Log},
    sol,
    transports::http::{Client, Http},
};
use std::sync::Arc;
use tracing::{debug, trace, warn};

sol! {
    event Transfer(address indexed from, address indexed to, uint256 value);
}

pub struct BlockchainService {
    provider: Arc<RootProvider<Http<Client>>>,
    config: ChainConfig,
    token_registry: TokenRegistry,
    transfer_signature: alloy::primitives::B256,
}

impl BlockchainService {
    pub fn new(provider: RootProvider<Http<Client>>, config: ChainConfig) -> Result<Self> {
        let tokens: Vec<Token> = config
            .stablecoins
            .iter()
            .map(|tc| Token {
                symbol: tc.symbol.clone(),
                address: tc.address,
                decimals: tc.decimals,
            })
            .collect();

        let token_registry = TokenRegistry::new(tokens);
        // Use the Transfer event signature hash
        let transfer_signature = alloy::primitives::keccak256("Transfer(address,address,uint256)");

        Ok(Self {
            provider: Arc::new(provider),
            config,
            token_registry,
            transfer_signature,
        })
    }

    pub async fn get_latest_block(&self) -> Result<u64> {
        let block_number = self
            .provider
            .get_block_number()
            .await
            .map_err(|e| MonitorError::Rpc(format!("Failed to get block number: {}", e)))?;

        Ok(block_number)
    }

    pub async fn get_block_logs(&self, block_num: u64) -> Result<Vec<Log>> {
        debug!("Fetching logs for block {}", block_num);

        let token_addresses = self.token_registry.all_addresses();

        let filter = Filter::new()
            .from_block(block_num)
            .to_block(block_num)
            .address(token_addresses)
            .event_signature(self.transfer_signature);

        let logs =
            self.provider
                .get_logs(&filter)
                .await
                .map_err(|e| MonitorError::BlockProcessing {
                    block: block_num,
                    details: format!("Failed to fetch logs: {}", e),
                })?;

        trace!("Found {} logs in block {}", logs.len(), block_num);
        Ok(logs)
    }

    pub fn parse_transfer_log(&self, log: &Log) -> Result<Option<Transaction>> {
        // Check if this is from a monitored token
        let token = match self.token_registry.get(&log.address()) {
            Some(token) => token.clone(),
            None => {
                trace!("Log from unmonitored token: {:?}", log.address());
                return Ok(None);
            }
        };

        // Check if this is a Transfer event
        if log.topics().len() < 3 {
            trace!("Log has insufficient topics for Transfer event");
            return Ok(None);
        }

        if log.topics()[0] != self.transfer_signature {
            trace!("Log is not a Transfer event");
            return Ok(None);
        }

        // Parse Transfer event
        let from = Address::from_slice(&log.topics()[1][12..]);
        let to = Address::from_slice(&log.topics()[2][12..]);

        let data_bytes = log.data().data.as_ref();
        let value = if data_bytes.len() >= 32 {
            U256::from_be_slice(&data_bytes[0..32])
        } else {
            return Err(MonitorError::Parse(
                "Invalid data length for Transfer event".to_string(),
            ));
        };

        let tx_hash = log
            .transaction_hash
            .ok_or_else(|| MonitorError::Parse("Missing transaction hash".to_string()))?;

        let block_number = log
            .block_number
            .ok_or_else(|| MonitorError::Parse("Missing block number".to_string()))?;

        Ok(Some(Transaction::new(
            token,
            value,
            from,
            to,
            block_number,
            tx_hash,
        )))
    }

    pub async fn get_block_timestamp(&self, block_num: u64) -> Result<Option<u64>> {
        match self
            .provider
            .get_block_by_number(block_num.into(), BlockTransactionsKind::Hashes)
            .await
        {
            Ok(Some(block)) => Ok(Some(block.header.timestamp)),
            Ok(None) => {
                warn!("Block {} not found", block_num);
                Ok(None)
            }
            Err(e) => {
                warn!("Failed to fetch block {}: {}", block_num, e);
                Ok(None)
            }
        }
    }

    pub fn get_token_registry(&self) -> &TokenRegistry {
        &self.token_registry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_registry() {
        let config = ChainConfig {
            network: "test".to_string(),
            poll_interval_secs: 2,
            stablecoins: vec![crate::config::TokenConfig {
                symbol: "USDC".to_string(),
                address: address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
                decimals: 6,
            }],
            start_block: None,
            blocks_per_batch: 10,
        };

        let provider =
            RootProvider::<Http<Client>>::new_http("https://base.llamarpc.com".parse().unwrap());
        let service = BlockchainService::new(provider, config).unwrap();

        // Test the token registry
        let token = service
            .token_registry
            .get(&address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"));
        assert!(token.is_some());
        assert_eq!(token.unwrap().symbol, "USDC");
        assert_eq!(token.unwrap().decimals, 6);
    }
}
