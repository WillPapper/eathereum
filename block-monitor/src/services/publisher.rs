use crate::{
    config::RedisConfig,
    domain::{Transaction, TransactionMessage},
    error::{MonitorError, Result},
};
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, Client as RedisClient};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};

#[async_trait]
pub trait Publisher: Send + Sync {
    async fn publish(&self, transaction: &Transaction) -> Result<()>;
    fn name(&self) -> &str;
}

pub struct CompositePublisher {
    publishers: Vec<Box<dyn Publisher>>,
}

impl CompositePublisher {
    pub fn new(publishers: Vec<Box<dyn Publisher>>) -> Self {
        Self { publishers }
    }

    pub async fn publish_all(&self, transaction: &Transaction) {
        for publisher in &self.publishers {
            if let Err(e) = publisher.publish(transaction).await {
                warn!("Failed to publish to {}: {}", publisher.name(), e);
            }
        }
    }
}

pub struct RedisPublisher {
    connection: Arc<tokio::sync::Mutex<MultiplexedConnection>>,
    stream_key: String,
    max_len: usize,
}

impl RedisPublisher {
    pub async fn new(config: &RedisConfig) -> Result<Option<Self>> {
        let Some(redis_url) = &config.url else {
            debug!("Redis URL not configured, skipping Redis publisher");
            return Ok(None);
        };

        let client = RedisClient::open(redis_url.as_str()).map_err(|e| MonitorError::Redis(e))?;

        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| MonitorError::ConnectionLost {
                service: "Redis".to_string(),
                details: e.to_string(),
            })?;

        Ok(Some(Self {
            connection: Arc::new(tokio::sync::Mutex::new(connection)),
            stream_key: config.stream_key.clone(),
            max_len: config.max_stream_length,
        }))
    }

    async fn publish_to_stream(&self, message: &TransactionMessage) -> Result<()> {
        let mut conn = self.connection.lock().await;

        let id: String = conn
            .xadd_maxlen(
                &self.stream_key,
                redis::streams::StreamMaxlen::Approx(self.max_len),
                "*",
                &[
                    ("stablecoin", &message.stablecoin),
                    ("amount", &message.amount),
                    ("from", &message.from),
                    ("to", &message.to),
                    ("block_number", &message.block_number.to_string()),
                    ("tx_hash", &message.tx_hash),
                ],
            )
            .await
            .map_err(|e| MonitorError::Redis(e))?;

        debug!("Published to Redis stream with ID: {}", id);
        Ok(())
    }
}

#[async_trait]
impl Publisher for RedisPublisher {
    async fn publish(&self, transaction: &Transaction) -> Result<()> {
        let message = transaction.to_message();
        self.publish_to_stream(&message).await
    }

    fn name(&self) -> &str {
        "Redis"
    }
}

pub struct WebSocketPublisher {
    broadcaster: broadcast::Sender<String>,
}

impl WebSocketPublisher {
    pub fn new(capacity: usize) -> (Self, broadcast::Receiver<String>) {
        let (tx, rx) = broadcast::channel(capacity);
        (Self { broadcaster: tx }, rx)
    }

    pub fn subscriber_count(&self) -> usize {
        self.broadcaster.receiver_count()
    }
}

#[async_trait]
impl Publisher for WebSocketPublisher {
    async fn publish(&self, transaction: &Transaction) -> Result<()> {
        let message = transaction.to_message();
        let json = message.to_json()?;

        match self.broadcaster.send(json) {
            Ok(count) => {
                debug!("Broadcast to {} WebSocket clients", count);
                Ok(())
            }
            Err(_) => {
                // No receivers, not an error
                debug!("No WebSocket clients connected");
                Ok(())
            }
        }
    }

    fn name(&self) -> &str {
        "WebSocket"
    }
}

pub struct LogPublisher;

impl LogPublisher {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Publisher for LogPublisher {
    async fn publish(&self, transaction: &Transaction) -> Result<()> {
        let message = transaction.to_message();
        tracing::info!(
            "Transaction: {} {} from {} to {} at block {}",
            message.amount,
            message.stablecoin,
            &message.from[..8],
            &message.to[..8],
            message.block_number
        );
        Ok(())
    }

    fn name(&self) -> &str {
        "Log"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Token;
    use alloy::primitives::{Address, TxHash, U256};

    fn create_test_transaction() -> Transaction {
        let token = Token {
            symbol: "USDC".to_string(),
            address: Address::ZERO,
            decimals: 6,
        };
        Transaction::new(
            token,
            U256::from(1_000_000u64),
            Address::ZERO,
            Address::ZERO,
            12345,
            TxHash::ZERO,
        )
    }

    #[tokio::test]
    async fn test_websocket_publisher() {
        let (publisher, mut receiver) = WebSocketPublisher::new(10);
        let tx = create_test_transaction();

        // Spawn a receiver
        let handle = tokio::spawn(async move { receiver.recv().await });

        // Give receiver time to subscribe
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Publish
        publisher.publish(&tx).await.unwrap();

        // Check received
        let result = handle.await.unwrap().unwrap();
        assert!(result.contains("USDC"));
        assert!(result.contains("1.00"));
    }

    #[tokio::test]
    async fn test_composite_publisher() {
        let log_publisher = Box::new(LogPublisher::new());
        let (ws_publisher, _rx) = WebSocketPublisher::new(10);

        let composite = CompositePublisher::new(vec![log_publisher, Box::new(ws_publisher)]);

        let tx = create_test_transaction();
        composite.publish_all(&tx).await;
        // Should complete without panic
    }
}
