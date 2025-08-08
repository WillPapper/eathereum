use crate::{
    config::Config,
    domain::MonitorMetrics,
    error::{ErrorContext, Result, ResultExt},
    services::{BlockchainService, CompositePublisher},
};
use std::time::Duration;
use tokio::signal::ctrl_c;
use tracing::{debug, info, warn};

pub struct StablecoinMonitor {
    blockchain: BlockchainService,
    publisher: CompositePublisher,
    config: Config,
    state: MonitorState,
}

struct MonitorState {
    last_processed_block: Option<u64>,
    metrics: MonitorMetrics,
}

impl StablecoinMonitor {
    pub fn new(
        blockchain: BlockchainService,
        publisher: CompositePublisher,
        config: Config,
    ) -> Self {
        let state = MonitorState {
            last_processed_block: config.chain.start_block,
            metrics: MonitorMetrics::default(),
        };

        Self {
            blockchain,
            publisher,
            config,
            state,
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        info!("Starting stablecoin monitor...");
        info!(
            "Monitoring {} stablecoins on {}",
            self.config.chain.stablecoins.len(),
            self.config.chain.network
        );

        let mut interval =
            tokio::time::interval(Duration::from_secs(self.config.chain.poll_interval_secs));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if let Err(e) = self.process_new_blocks().await {
                        let context = ErrorContext::new("process_new_blocks")
                            .with_retry(self.config.monitoring.max_retry_attempts);
                        Err(e).with_context(context)?;
                    }
                }
                _ = ctrl_c() => {
                    info!("Shutdown signal received");
                    break;
                }
            }
        }

        self.shutdown().await;
        Ok(())
    }

    async fn process_new_blocks(&mut self) -> Result<()> {
        let latest_block = self.blockchain.get_latest_block().await?;
        let blocks_to_process = self.get_block_range(latest_block)?;

        if blocks_to_process.is_empty() {
            debug!("No new blocks to process");
            return Ok(());
        }

        info!(
            "Processing blocks {} to {}",
            blocks_to_process.first().unwrap(),
            blocks_to_process.last().unwrap()
        );

        for block_num in blocks_to_process {
            match self.process_single_block(block_num).await {
                Ok(tx_count) => {
                    self.state.metrics.record_block(block_num);
                    self.state.metrics.record_transactions(tx_count);
                    self.state.last_processed_block = Some(block_num);
                }
                Err(e) => {
                    self.state.metrics.record_error();
                    warn!("Failed to process block {}: {}", block_num, e);
                    // Continue with next block
                }
            }
        }

        Ok(())
    }

    fn get_block_range(&self, latest_block: u64) -> Result<Vec<u64>> {
        let start_block = match self.state.last_processed_block {
            Some(last) => last + 1,
            None => {
                // First run, start from latest block
                self.config.chain.start_block.unwrap_or(latest_block)
            }
        };

        if start_block > latest_block {
            return Ok(vec![]);
        }

        // Limit batch size to prevent overwhelming the system
        let end_block = std::cmp::min(
            latest_block,
            start_block + self.config.chain.blocks_per_batch as u64 - 1,
        );

        Ok((start_block..=end_block).collect())
    }

    async fn process_single_block(&mut self, block_num: u64) -> Result<usize> {
        debug!("Processing block {}", block_num);

        // Fetch logs for this block
        let logs = self.blockchain.get_block_logs(block_num).await?;

        if logs.is_empty() {
            debug!("No relevant logs in block {}", block_num);
            return Ok(0);
        }

        // Optionally fetch block timestamp
        let timestamp = self
            .blockchain
            .get_block_timestamp(block_num)
            .await
            .ok()
            .flatten();

        // Parse and publish transactions
        let mut transaction_count = 0;

        for log in &logs {
            match self.blockchain.parse_transfer_log(log)? {
                Some(mut transaction) => {
                    // Add timestamp if available
                    if let Some(ts) = timestamp {
                        transaction = transaction.with_timestamp(ts);
                    }

                    // Check if this is a large transaction
                    if transaction
                        .is_large_transaction(self.config.monitoring.batch_size as f64 * 100.0)
                    {
                        info!(
                            "Large transaction detected: {} {} at block {}",
                            transaction.amount.format(),
                            transaction.token.symbol,
                            block_num
                        );
                    }

                    // Publish to all configured publishers
                    self.publisher.publish_all(&transaction).await;
                    transaction_count += 1;
                }
                None => {
                    // Not a relevant transfer, skip
                    continue;
                }
            }
        }

        info!(
            "Processed block {} with {} transactions",
            block_num, transaction_count
        );

        Ok(transaction_count)
    }

    async fn shutdown(&self) {
        info!("Shutting down monitor...");
        info!("Final metrics: {:?}", self.state.metrics);
    }

    pub fn get_metrics(&self) -> &MonitorMetrics {
        &self.state.metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{LogPublisher, WebSocketPublisher};
    use alloy::providers::RootProvider;
    use alloy::transports::http::{Client, Http};

    #[tokio::test]
    async fn test_block_range_calculation() {
        let config = Config::from_env().unwrap();
        let provider = RootProvider::<Http<Client>>::new_http(config.rpc.url.parse().unwrap());

        let blockchain = BlockchainService::new(provider, config.chain.clone()).unwrap();
        let (ws_pub, _rx) = WebSocketPublisher::new(10);
        let publisher =
            CompositePublisher::new(vec![Box::new(LogPublisher::new()), Box::new(ws_pub)]);

        let mut monitor = StablecoinMonitor::new(blockchain, publisher, config);

        // Test first run
        let range = monitor.get_block_range(1000).unwrap();
        assert!(!range.is_empty());

        // Test after processing
        monitor.state.last_processed_block = Some(995);
        let range = monitor.get_block_range(1000).unwrap();
        assert_eq!(range, vec![996, 997, 998, 999, 1000]);
    }
}
