pub mod transaction;

pub use transaction::{Token, TokenAmount, Transaction, TransactionMessage};

use alloy::primitives::Address;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct TokenRegistry {
    tokens: HashMap<Address, Token>,
}

impl TokenRegistry {
    pub fn new(tokens: Vec<Token>) -> Self {
        let mut registry = HashMap::new();
        for token in tokens {
            registry.insert(token.address, token);
        }
        Self { tokens: registry }
    }

    pub fn get(&self, address: &Address) -> Option<&Token> {
        self.tokens.get(address)
    }

    pub fn contains(&self, address: &Address) -> bool {
        self.tokens.contains_key(address)
    }

    pub fn all_addresses(&self) -> Vec<Address> {
        self.tokens.keys().copied().collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockInfo {
    pub number: u64,
    pub timestamp: Option<u64>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorMetrics {
    pub blocks_processed: u64,
    pub transactions_found: u64,
    pub last_block_processed: u64,
    pub errors_count: u64,
    pub redis_publishes: u64,
    pub websocket_broadcasts: u64,
}

impl Default for MonitorMetrics {
    fn default() -> Self {
        Self {
            blocks_processed: 0,
            transactions_found: 0,
            last_block_processed: 0,
            errors_count: 0,
            redis_publishes: 0,
            websocket_broadcasts: 0,
        }
    }
}

impl MonitorMetrics {
    pub fn record_block(&mut self, block_num: u64) {
        self.blocks_processed += 1;
        self.last_block_processed = block_num;
    }

    pub fn record_transactions(&mut self, count: usize) {
        self.transactions_found += count as u64;
    }

    pub fn record_error(&mut self) {
        self.errors_count += 1;
    }

    pub fn record_redis_publish(&mut self) {
        self.redis_publishes += 1;
    }

    pub fn record_websocket_broadcast(&mut self) {
        self.websocket_broadcasts += 1;
    }
}
