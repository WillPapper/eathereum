use eyre::Result;
use redis::aio::MultiplexedConnection;
use redis::streams::{StreamReadOptions, StreamReadReply};
use redis::{AsyncCommands, Client};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{error, info, warn};

use crate::config::Config;
use crate::transaction::TransactionData;
use crate::websocket::ClientManager;

pub struct RedisConsumer {
    connection: MultiplexedConnection,
    config: Arc<Config>,
    client_manager: Arc<ClientManager>,
    stats: ConsumerStats,
}

struct ConsumerStats {
    total_messages: u64,
    last_log_time: Instant,
}

impl RedisConsumer {
    pub async fn new(config: Arc<Config>, client_manager: Arc<ClientManager>) -> Result<Self> {
        info!("Connecting to Redis...");
        let client = Client::open(config.redis_url.as_str())?;
        let connection = client.get_multiplexed_tokio_connection().await?;
        info!("✅ Connected to Redis successfully");

        Ok(Self {
            connection,
            config,
            client_manager,
            stats: ConsumerStats {
                total_messages: 0,
                last_log_time: Instant::now(),
            },
        })
    }

    pub async fn start_consuming(&mut self) -> Result<()> {
        self.ensure_consumer_group().await?;
        info!("Consumer group ready, starting to consume messages...");

        let last_id = ">".to_string();

        loop {
            let options = StreamReadOptions::default()
                .group(&self.config.consumer_group, &self.config.consumer_name)
                .count(10)
                .block(1000);

            let result: Result<StreamReadReply, redis::RedisError> = self
                .connection
                .xread_options(&[&self.config.redis_stream_key], &[&last_id], &options)
                .await;

            match result {
                Ok(reply) => {
                    self.process_messages(reply).await?;
                }
                Err(e) => {
                    if !e.to_string().contains("timeout") {
                        warn!("Error reading from stream: {:?}", e);
                        warn!("Will retry in 1 second...");
                        sleep(Duration::from_secs(1)).await;
                    } else {
                        self.log_stats_if_needed().await;
                    }
                }
            }
        }
    }

    async fn ensure_consumer_group(&mut self) -> Result<()> {
        let _: Result<(), redis::RedisError> = self
            .connection
            .xgroup_create_mkstream(
                &self.config.redis_stream_key,
                &self.config.consumer_group,
                "$",
            )
            .await
            .or_else(|e| {
                if e.to_string().contains("BUSYGROUP") {
                    info!("Consumer group already exists, reusing it");
                    Ok(())
                } else {
                    error!("Failed to create consumer group: {}", e);
                    Err(e)
                }
            });

        info!("Starting Redis stream consumer:");
        info!("  Stream: {}", self.config.redis_stream_key);
        info!("  Consumer Group: {}", self.config.consumer_group);
        info!("  Consumer Name: {}", self.config.consumer_name);

        Ok(())
    }

    async fn process_messages(&mut self, reply: StreamReadReply) -> Result<()> {
        let message_count = reply.keys.iter().map(|k| k.ids.len()).sum::<usize>();
        if message_count > 0 {
            info!("📦 Received {} messages from Redis stream", message_count);
        }

        for stream_key_data in reply.keys {
            for stream_id in stream_key_data.ids {
                info!("Processing message ID: {}", stream_id.id);

                if let Some(data) = parse_stream_data(&stream_id.map) {
                    self.stats.total_messages += 1;
                    info!(
                        "✅ Transaction #{}: {} ${} from {} to {}",
                        self.stats.total_messages,
                        data.stablecoin,
                        data.amount,
                        &data.from[..10],
                        &data.to[..10]
                    );

                    let client_count = self.client_manager.client_count().await;
                    info!("Broadcasting to {} connected clients", client_count);
                    self.client_manager.broadcast(&data).await;

                    let _: Result<(), redis::RedisError> = self
                        .connection
                        .xack(
                            &self.config.redis_stream_key,
                            &self.config.consumer_group,
                            &[&stream_id.id],
                        )
                        .await;
                } else {
                    warn!("Failed to parse message data from stream");
                }
            }
        }

        self.log_stats_if_needed().await;
        Ok(())
    }

    async fn log_stats_if_needed(&mut self) {
        if self.stats.last_log_time.elapsed().as_secs() > 30 {
            info!(
                "📊 Statistics: {} total messages processed, {} clients connected",
                self.stats.total_messages,
                self.client_manager.client_count().await
            );
            self.stats.last_log_time = Instant::now();
        } else if self.stats.last_log_time.elapsed().as_secs() > 60 {
            info!(
                "⏳ Still waiting for messages... (processed {} total, {} clients connected)",
                self.stats.total_messages,
                self.client_manager.client_count().await
            );
            self.stats.last_log_time = Instant::now();
        }
    }
}

fn parse_stream_data(data: &HashMap<String, redis::Value>) -> Option<TransactionData> {
    let get_string = |key: &str| -> Option<String> {
        data.get(key).and_then(|v| match v {
            redis::Value::BulkString(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        })
    };

    let get_u64 = |key: &str| -> Option<u64> { get_string(key).and_then(|s| s.parse().ok()) };

    Some(TransactionData {
        stablecoin: get_string("stablecoin")?,
        amount: get_string("amount")?,
        from: get_string("from")?,
        to: get_string("to")?,
        block_number: get_u64("block")?,
        tx_hash: get_string("tx_hash")?,
    })
}
