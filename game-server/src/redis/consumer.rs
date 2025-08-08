use crate::{
    config::RedisConfig,
    error::{Result, ServerError},
    redis::stream_message::StreamMessage,
};
use redis::{aio::MultiplexedConnection, streams::StreamReadOptions, AsyncCommands, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

pub struct RedisConsumer {
    connection: Arc<Mutex<MultiplexedConnection>>,
    config: RedisConfig,
    #[allow(dead_code)]
    last_id: String,
}

impl RedisConsumer {
    pub async fn new(config: RedisConfig) -> Result<Self> {
        let client = redis::Client::open(config.url.as_str()).map_err(ServerError::Redis)?;

        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(ServerError::Redis)?;

        let mut consumer = Self {
            connection: Arc::new(Mutex::new(connection)),
            config,
            last_id: "0".to_string(),
        };

        // Create consumer group if it doesn't exist
        consumer.create_consumer_group().await?;

        Ok(consumer)
    }

    pub async fn create_consumer_group(&mut self) -> Result<()> {
        let mut conn = self.connection.lock().await;

        // Try to create the consumer group, ignore if it already exists
        let result: redis::RedisResult<()> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(&self.config.stream_key)
            .arg(&self.config.consumer_group)
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut *conn)
            .await;

        match result {
            Ok(_) => {
                info!(
                    "Created consumer group '{}' for stream '{}'",
                    self.config.consumer_group, self.config.stream_key
                );
            }
            Err(e) if e.to_string().contains("BUSYGROUP") => {
                debug!(
                    "Consumer group '{}' already exists",
                    self.config.consumer_group
                );
            }
            Err(e) => {
                return Err(ServerError::Redis(e));
            }
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub async fn read_messages(&mut self) -> Result<Vec<StreamMessage>> {
        let mut conn = self.connection.lock().await;

        let opts = StreamReadOptions::default()
            .count(self.config.batch_size)
            .block(self.config.block_timeout_ms as usize);

        let result: redis::RedisResult<redis::streams::StreamReadReply> = conn
            .xread_options(&[&self.config.stream_key], &[&self.last_id], &opts)
            .await;

        match result {
            Ok(stream_reply) => {
                let mut messages = Vec::new();

                for stream_key in stream_reply.keys {
                    if stream_key.key == self.config.stream_key {
                        for stream_id in stream_key.ids {
                            match StreamMessage::from_redis_stream(
                                stream_id.id.clone(),
                                &stream_id.map,
                            ) {
                                Ok(msg) => {
                                    self.last_id = stream_id.id.clone();
                                    messages.push(msg);
                                }
                                Err(e) => {
                                    warn!("Failed to parse message {}: {}", stream_id.id, e);
                                }
                            }
                        }
                    }
                }

                Ok(messages)
            }
            Err(e) if e.kind() == redis::ErrorKind::TypeError => {
                // Timeout, no messages available
                Ok(Vec::new())
            }
            Err(e) => Err(ServerError::Redis(e)),
        }
    }

    pub async fn read_pending_messages(&mut self) -> Result<Vec<StreamMessage>> {
        let result = {
            let mut conn = self.connection.lock().await;

            type StreamGroupData = HashMap<String, Vec<HashMap<String, HashMap<String, Value>>>>;
            let result: redis::RedisResult<StreamGroupData> = redis::cmd("XREADGROUP")
                .arg("GROUP")
                .arg(&self.config.consumer_group)
                .arg(&self.config.consumer_name)
                .arg("COUNT")
                .arg(self.config.batch_size)
                .arg("BLOCK")
                .arg(self.config.block_timeout_ms)
                .arg("STREAMS")
                .arg(&self.config.stream_key)
                .arg(">") // Read only new messages
                .query_async(&mut *conn)
                .await;
            result
        }; // Drop the lock here

        match result {
            Ok(streams) => {
                let mut messages = Vec::new();

                if let Some(entries) = streams.get(&self.config.stream_key) {
                    for entry in entries {
                        for (id, data) in entry {
                            match StreamMessage::from_redis_stream(id.clone(), data) {
                                Ok(msg) => messages.push(msg),
                                Err(e) => warn!("Failed to parse pending message {}: {}", id, e),
                            }
                        }
                    }
                }

                Ok(messages)
            }
            Err(e) if e.to_string().contains("NOGROUP") => {
                // Consumer group doesn't exist, recreate it
                self.create_consumer_group().await?;
                Ok(Vec::new())
            }
            Err(e) => Err(ServerError::Redis(e)),
        }
    }

    pub async fn acknowledge(&mut self, id: &str) -> Result<()> {
        let mut conn = self.connection.lock().await;

        let result: redis::RedisResult<i64> = redis::cmd("XACK")
            .arg(&self.config.stream_key)
            .arg(&self.config.consumer_group)
            .arg(id)
            .query_async(&mut *conn)
            .await;

        match result {
            Ok(count) if count > 0 => {
                debug!("Acknowledged message {}", id);
                Ok(())
            }
            Ok(_) => {
                warn!("Message {} was not pending", id);
                Ok(())
            }
            Err(e) => Err(ServerError::Redis(e)),
        }
    }

    #[allow(dead_code)]
    pub async fn health_check(&self) -> Result<bool> {
        let mut conn = self.connection.lock().await;
        let result: redis::RedisResult<String> = redis::cmd("PING").query_async(&mut *conn).await;

        match result {
            Ok(response) if response == "PONG" => Ok(true),
            _ => Ok(false),
        }
    }

    pub fn get_stream_key(&self) -> &str {
        &self.config.stream_key
    }

    #[allow(dead_code)]
    pub fn get_consumer_group(&self) -> &str {
        &self.config.consumer_group
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_redis_consumer_creation() {
        let config = RedisConfig {
            url: "redis://localhost:6379".to_string(),
            stream_key: "test:stream".to_string(),
            consumer_group: "test-group".to_string(),
            consumer_name: "test-consumer".to_string(),
            batch_size: 10,
            block_timeout_ms: 1000,
            retry_delay_secs: 1,
        };

        // This test requires a running Redis instance
        // In a real test suite, we'd use a mock or test container
        match RedisConsumer::new(config).await {
            Ok(consumer) => {
                assert_eq!(consumer.get_stream_key(), "test:stream");
                assert_eq!(consumer.get_consumer_group(), "test-group");
            }
            Err(_) => {
                // Redis not available, skip test
                println!("Redis not available, skipping test");
            }
        }
    }
}
