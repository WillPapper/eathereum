use redis::aio::MultiplexedConnection;
use redis::Client as RedisClient;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, info, warn};

use crate::config::{REDIS_MAX_RETRIES, REDIS_STREAM_KEY, REDIS_STREAM_MAX_LEN};
use crate::transaction::TransactionData;

pub struct RedisPublisher {
    connection: Option<MultiplexedConnection>,
}

impl RedisPublisher {
    pub async fn new(redis_url: Option<String>) -> Self {
        let connection = if let Some(url) = redis_url {
            Self::connect_with_retry(&url, REDIS_MAX_RETRIES).await
        } else {
            info!("REDIS_URL not set, running without Redis");
            None
        };

        Self { connection }
    }

    async fn connect_with_retry(
        redis_url: &str,
        max_retries: u32,
    ) -> Option<MultiplexedConnection> {
        let mut retry_count = 0;
        let mut delay = Duration::from_secs(1);

        loop {
            match RedisClient::open(redis_url) {
                Ok(client) => match client.get_multiplexed_tokio_connection().await {
                    Ok(conn) => {
                        info!(
                            "Connected to Redis successfully after {} retries",
                            retry_count
                        );
                        return Some(conn);
                    }
                    Err(e) => {
                        if retry_count >= max_retries {
                            warn!("Failed to connect to Redis after {} retries: {}. Running without Redis.", max_retries, e);
                            return None;
                        }
                        warn!(
                            "Redis connection attempt {} failed: {}. Retrying in {:?}...",
                            retry_count + 1,
                            e,
                            delay
                        );
                    }
                },
                Err(e) => {
                    if retry_count >= max_retries {
                        warn!("Failed to create Redis client after {} retries: {}. Running without Redis.", max_retries, e);
                        return None;
                    }
                    warn!(
                        "Redis client creation attempt {} failed: {}. Retrying in {:?}...",
                        retry_count + 1,
                        e,
                        delay
                    );
                }
            }

            sleep(delay).await;
            retry_count += 1;
            delay = std::cmp::min(delay * 2, Duration::from_secs(30));
        }
    }

    pub async fn publish(&mut self, tx_data: &TransactionData) {
        if let Some(mut conn) = self.connection.clone() {
            if let Ok(json_data) = serde_json::to_string(tx_data) {
                let block_str = tx_data.block_number.to_string();
                let entries = vec![
                    ("data", json_data.as_str()),
                    ("stablecoin", &tx_data.stablecoin),
                    ("amount", &tx_data.amount),
                    ("from", &tx_data.from),
                    ("to", &tx_data.to),
                    ("block", &block_str),
                    ("tx_hash", &tx_data.tx_hash),
                ];

                if let Err(e) = redis::cmd("XADD")
                    .arg(REDIS_STREAM_KEY)
                    .arg("MAXLEN")
                    .arg("~")
                    .arg(REDIS_STREAM_MAX_LEN)
                    .arg("*")
                    .arg(&entries)
                    .query_async::<String>(&mut conn)
                    .await
                {
                    error!("Failed to add to Redis stream {}: {}", REDIS_STREAM_KEY, e);
                }
            }
        }
    }
}
