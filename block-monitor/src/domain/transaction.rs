use alloy::primitives::{Address, TxHash, U256};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Token {
    pub symbol: String,
    pub address: Address,
    pub decimals: u8,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TokenAmount {
    pub value: U256,
    pub decimals: u8,
}

impl TokenAmount {
    pub fn new(value: U256, decimals: u8) -> Self {
        Self { value, decimals }
    }

    pub fn to_human_readable(&self) -> f64 {
        let divisor = 10_u64.pow(self.decimals as u32);
        let value_u128 = self.value.to::<u128>();
        value_u128 as f64 / divisor as f64
    }

    pub fn format(&self) -> String {
        format!("{:.2}", self.to_human_readable())
    }
}

#[derive(Debug, Clone)]
pub struct Transaction {
    pub token: Token,
    pub amount: TokenAmount,
    pub from: Address,
    pub to: Address,
    pub block_number: u64,
    pub tx_hash: TxHash,
    pub timestamp: Option<u64>,
}

impl Transaction {
    pub fn new(
        token: Token,
        amount: U256,
        from: Address,
        to: Address,
        block_number: u64,
        tx_hash: TxHash,
    ) -> Self {
        let amount = TokenAmount::new(amount, token.decimals);
        Self {
            token,
            amount,
            from,
            to,
            block_number,
            tx_hash,
            timestamp: None,
        }
    }

    pub fn with_timestamp(mut self, timestamp: u64) -> Self {
        self.timestamp = Some(timestamp);
        self
    }

    pub fn to_message(&self) -> TransactionMessage {
        TransactionMessage {
            stablecoin: self.token.symbol.clone(),
            amount: self.amount.format(),
            from: format!("{:?}", self.from),
            to: format!("{:?}", self.to),
            block_number: self.block_number,
            tx_hash: format!("{:?}", self.tx_hash),
            timestamp: self.timestamp,
        }
    }

    pub fn is_large_transaction(&self, threshold: f64) -> bool {
        self.amount.to_human_readable() >= threshold
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionMessage {
    pub stablecoin: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub block_number: u64,
    pub tx_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

impl TransactionMessage {
    pub fn to_json(&self) -> eyre::Result<String> {
        Ok(serde_json::to_string(self)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_amount_formatting() {
        let amount = TokenAmount::new(U256::from(1_500_000u64), 6);
        assert_eq!(amount.to_human_readable(), 1.5);
        assert_eq!(amount.format(), "1.50");

        let amount = TokenAmount::new(U256::from(1_000_000_000_000_000_000u128), 18);
        assert_eq!(amount.to_human_readable(), 1.0);
    }

    #[test]
    fn test_transaction_large_detection() {
        let token = Token {
            symbol: "USDC".to_string(),
            address: Address::ZERO,
            decimals: 6,
        };

        let tx = Transaction::new(
            token,
            U256::from(15_000_000_000u64), // 15,000 USDC
            Address::ZERO,
            Address::ZERO,
            100,
            TxHash::ZERO,
        );

        assert!(tx.is_large_transaction(10_000.0));
        assert!(!tx.is_large_transaction(20_000.0));
    }
}
