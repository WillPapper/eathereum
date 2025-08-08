use eyre::Result;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tokio::time::{self, Duration};
use tracing::{error, info, warn};

use crate::blockchain::BlockchainMonitor;
use crate::config::POLLING_INTERVAL_SECS;
use crate::redis_publisher::RedisPublisher;
use crate::transaction::TransactionData;

pub struct StablecoinMonitor {
    blockchain: BlockchainMonitor,
    redis_publisher: RedisPublisher,
    tx_broadcaster: broadcast::Sender<TransactionData>,
    last_block: Arc<RwLock<u64>>,
}

impl StablecoinMonitor {
    pub async fn new(
        blockchain: BlockchainMonitor,
        redis_publisher: RedisPublisher,
        tx_broadcaster: broadcast::Sender<TransactionData>,
    ) -> Result<Self> {
        let current_block = blockchain.get_current_block().await?;

        Ok(Self {
            blockchain,
            redis_publisher,
            tx_broadcaster,
            last_block: Arc::new(RwLock::new(current_block)),
        })
    }

    pub async fn start(&mut self) {
        let mut interval = time::interval(Duration::from_secs(POLLING_INTERVAL_SECS));
        let mut last_logged_block = 0u64;

        info!(
            "Starting blockchain monitoring loop (polling every {} seconds)",
            POLLING_INTERVAL_SECS
        );

        loop {
            interval.tick().await;

            match self.blockchain.get_current_block().await {
                Ok(current_block) => {
                    let last_processed = *self.last_block.read().await;

                    if current_block > last_processed {
                        if let Err(e) = self.check_new_blocks().await {
                            error!("Unexpected error checking blocks: {}", e);
                        }
                    } else if current_block != last_logged_block {
                        info!("Waiting for new blocks... (current: {})", current_block);
                        last_logged_block = current_block;
                    }
                }
                Err(e) => {
                    error!("Error fetching current block number: {}", e);
                }
            }
        }
    }

    async fn check_new_blocks(&mut self) -> Result<()> {
        let latest_block = self.blockchain.get_current_block().await?;
        let last_processed = *self.last_block.read().await;

        if latest_block > last_processed {
            for block_num in (last_processed + 1)..=latest_block {
                info!("Processing block {}", block_num);

                match self.blockchain.process_block(block_num).await {
                    Ok(transactions) => {
                        if !transactions.is_empty() {
                            info!(
                                "Block {} processed: {} stablecoin transfers found",
                                block_num,
                                transactions.len()
                            );

                            for tx_data in transactions {
                                self.redis_publisher.publish(&tx_data).await;
                                let _ = self.tx_broadcaster.send(tx_data);
                            }
                        } else {
                            info!("Block {} processed: no stablecoin transfers", block_num);
                        }
                    }
                    Err(e) => {
                        warn!(
                            "Error processing block {}: {}. Skipping block.",
                            block_num, e
                        );
                    }
                }
            }

            *self.last_block.write().await = latest_block;
            info!("Caught up to block {}", latest_block);
        }

        Ok(())
    }
}
