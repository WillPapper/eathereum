use crate::error::{Result, ServerError};
use redis::Value;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionData {
    pub stablecoin: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub block_number: u64,
    pub tx_hash: String,
}

#[derive(Debug, Clone)]
pub struct StreamMessage {
    pub id: String,
    pub data: TransactionData,
    pub timestamp: u64,
}

impl StreamMessage {
    pub fn from_redis_stream(id: String, map: &HashMap<String, Value>) -> Result<Self> {
        let stablecoin = extract_string(map, "stablecoin")?;
        let amount = extract_string(map, "amount")?;
        let from = extract_string(map, "from")?;
        let to = extract_string(map, "to")?;
        let block_number = extract_u64(map, "block_number")?;
        let tx_hash = extract_string(map, "tx_hash")?;
        
        let data = TransactionData {
            stablecoin,
            amount,
            from,
            to,
            block_number,
            tx_hash,
        };
        
        // Extract timestamp from message ID (format: "timestamp-sequence")
        let timestamp = id
            .split('-')
            .next()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        
        Ok(StreamMessage {
            id,
            data,
            timestamp,
        })
    }
    
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(&self.data)
            .map_err(|e| ServerError::Serialization(e))
    }
    
    pub fn format_for_display(&self, address_length: usize) -> String {
        let from_display = if self.data.from.len() > address_length {
            &self.data.from[..address_length]
        } else {
            &self.data.from
        };
        
        let to_display = if self.data.to.len() > address_length {
            &self.data.to[..address_length]
        } else {
            &self.data.to
        };
        
        format!(
            "{} {} from {}... to {}... (block: {})",
            self.data.amount,
            self.data.stablecoin,
            from_display,
            to_display,
            self.data.block_number
        )
    }
}

fn extract_string(map: &HashMap<String, Value>, key: &str) -> Result<String> {
    match map.get(key) {
        Some(Value::BulkString(bytes)) => {
            String::from_utf8(bytes.clone())
                .map_err(|e| ServerError::Parse(format!("Invalid UTF-8 for {}: {}", key, e)))
        }
        _ => Err(ServerError::Parse(format!("Missing or invalid field: {}", key))),
    }
}

fn extract_u64(map: &HashMap<String, Value>, key: &str) -> Result<u64> {
    let str_value = extract_string(map, key)?;
    str_value
        .parse::<u64>()
        .map_err(|e| ServerError::Parse(format!("Invalid u64 for {}: {}", key, e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_stream_message_from_redis() {
        let mut map = HashMap::new();
        map.insert("stablecoin".to_string(), Value::Data(b"USDC".to_vec()));
        map.insert("amount".to_string(), Value::Data(b"100.50".to_vec()));
        map.insert("from".to_string(), Value::Data(b"0x1234567890abcdef".to_vec()));
        map.insert("to".to_string(), Value::Data(b"0xfedcba0987654321".to_vec()));
        map.insert("block_number".to_string(), Value::Data(b"12345".to_vec()));
        map.insert("tx_hash".to_string(), Value::Data(b"0xabc123".to_vec()));
        
        let message = StreamMessage::from_redis_stream("1234567890-0".to_string(), &map).unwrap();
        
        assert_eq!(message.id, "1234567890-0");
        assert_eq!(message.data.stablecoin, "USDC");
        assert_eq!(message.data.amount, "100.50");
        assert_eq!(message.data.block_number, 12345);
        assert_eq!(message.timestamp, 1234567890);
    }
    
    #[test]
    fn test_format_for_display() {
        let data = TransactionData {
            stablecoin: "USDC".to_string(),
            amount: "100.50".to_string(),
            from: "0x1234567890abcdef1234567890abcdef".to_string(),
            to: "0xfedcba0987654321fedcba0987654321".to_string(),
            block_number: 12345,
            tx_hash: "0xabc123".to_string(),
        };
        
        let message = StreamMessage {
            id: "1234567890-0".to_string(),
            data,
            timestamp: 1234567890,
        };
        
        let display = message.format_for_display(10);
        assert!(display.contains("100.50 USDC"));
        assert!(display.contains("0x12345678"));
        assert!(display.contains("block: 12345"));
    }
}