use crate::{
    config::ConsumerConfig,
    error::{ErrorContext, ErrorExt, ErrorSeverity, Result, ServerError},
    redis::{RedisConsumer, StreamMessage},
    websocket::ClientManager,
};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

pub struct ProcessorMetrics {
    pub messages_processed: u64,
    pub messages_failed: u64,
    pub batches_processed: u64,
    pub last_message_time: Option<Instant>,
    pub last_stats_time: Instant,
}

impl ProcessorMetrics {
    pub fn new() -> Self {
        Self {
            messages_processed: 0,
            messages_failed: 0,
            batches_processed: 0,
            last_message_time: None,
            last_stats_time: Instant::now(),
        }
    }

    pub fn record_batch(&mut self, count: usize) {
        self.batches_processed += 1;
        self.messages_processed += count as u64;
        if count > 0 {
            self.last_message_time = Some(Instant::now());
        }
    }

    pub fn record_failure(&mut self) {
        self.messages_failed += 1;
    }

    pub fn should_log_stats(&self, interval_secs: u64) -> bool {
        self.last_stats_time.elapsed().as_secs() >= interval_secs
    }

    pub fn reset_stats_timer(&mut self) {
        self.last_stats_time = Instant::now();
    }
}

pub struct MessageProcessor {
    redis_consumer: RedisConsumer,
    client_manager: Arc<ClientManager>,
    config: ConsumerConfig,
    metrics: Arc<RwLock<ProcessorMetrics>>,
}

impl MessageProcessor {
    pub fn new(
        redis_consumer: RedisConsumer,
        client_manager: Arc<ClientManager>,
        config: ConsumerConfig,
    ) -> Self {
        Self {
            redis_consumer,
            client_manager,
            config,
            metrics: Arc::new(RwLock::new(ProcessorMetrics::new())),
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        info!(
            "Starting message processor for stream: {}",
            self.redis_consumer.get_stream_key()
        );
        
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 5;
        
        loop {
            match self.process_batch().await {
                Ok(count) => {
                    consecutive_errors = 0;
                    
                    let mut metrics = self.metrics.write().await;
                    metrics.record_batch(count);
                    
                    // Log statistics periodically
                    if metrics.should_log_stats(self.config.stats_interval_secs) {
                        self.log_statistics(&metrics).await;
                        metrics.reset_stats_timer();
                    }
                    
                    // Warn if no messages for a while
                    if let Some(last_time) = metrics.last_message_time {
                        if last_time.elapsed().as_secs() > self.config.warning_interval_secs {
                            warn!(
                                "No messages received for {} seconds",
                                last_time.elapsed().as_secs()
                            );
                        }
                    }
                }
                Err(e) => {
                    consecutive_errors += 1;
                    
                    let context = ErrorContext::new("process_batch")
                        .retryable()
                        .with_severity(if consecutive_errors >= max_consecutive_errors {
                            ErrorSeverity::Critical
                        } else {
                            ErrorSeverity::Warning
                        });
                    
                    context.log(&e);
                    self.metrics.write().await.record_failure();
                    
                    if consecutive_errors >= max_consecutive_errors {
                        error!("Too many consecutive errors, exiting processor");
                        return Err(e);
                    }
                    
                    self.handle_error(e).await?;
                }
            }
        }
    }

    async fn process_batch(&mut self) -> Result<usize> {
        // Read messages from Redis stream
        let messages = self.redis_consumer.read_pending_messages().await?;
        
        if messages.is_empty() {
            debug!("No new messages in stream");
            return Ok(0);
        }
        
        info!("Processing {} messages", messages.len());
        
        let mut processed = 0;
        for message in messages {
            match self.process_single_message(&message).await {
                Ok(_) => {
                    // Acknowledge the message
                    if let Err(e) = self.redis_consumer.acknowledge(&message.id).await {
                        warn!("Failed to acknowledge message {}: {}", message.id, e);
                    }
                    processed += 1;
                }
                Err(e) => {
                    error!("Failed to process message {}: {}", message.id, e);
                    self.metrics.write().await.record_failure();
                    // Continue processing other messages
                }
            }
        }
        
        Ok(processed)
    }

    async fn process_single_message(&self, message: &StreamMessage) -> Result<()> {
        // Format message for display
        let display_str = message.format_for_display(self.config.address_display_length);
        debug!("Processing: {}", display_str);
        
        // Convert to JSON for broadcasting
        let json = message.to_json()?;
        
        // Broadcast to all connected clients
        let result = self.client_manager.broadcast(&json).await;
        
        if result.successful > 0 {
            debug!(
                "Broadcast message to {} clients (failed: {})",
                result.successful,
                result.failed.len()
            );
        } else if !result.failed.is_empty() {
            warn!("Failed to broadcast to any clients");
        }
        
        Ok(())
    }

    async fn handle_error(&self, error: ServerError) -> Result<()> {
        if error.is_retryable() {
            warn!("Retryable error, waiting before retry...");
            tokio::time::sleep(Duration::from_secs(1)).await;
            Ok(())
        } else if error.should_reconnect() {
            error!("Connection error, attempting to reconnect...");
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok(())
        } else {
            Err(error)
        }
    }

    async fn log_statistics(&self, metrics: &ProcessorMetrics) {
        let client_count = self.client_manager.get_client_count().await;
        
        info!(
            "Stats - Messages: {} | Failed: {} | Batches: {} | Clients: {}",
            metrics.messages_processed,
            metrics.messages_failed,
            metrics.batches_processed,
            client_count
        );
    }

    pub async fn get_metrics(&self) -> ProcessorMetrics {
        let metrics = self.metrics.read().await;
        ProcessorMetrics {
            messages_processed: metrics.messages_processed,
            messages_failed: metrics.messages_failed,
            batches_processed: metrics.batches_processed,
            last_message_time: metrics.last_message_time,
            last_stats_time: metrics.last_stats_time,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{RedisConfig, WebSocketConfig};

    #[test]
    fn test_processor_metrics() {
        let mut metrics = ProcessorMetrics::new();
        
        metrics.record_batch(5);
        assert_eq!(metrics.messages_processed, 5);
        assert_eq!(metrics.batches_processed, 1);
        assert!(metrics.last_message_time.is_some());
        
        metrics.record_failure();
        assert_eq!(metrics.messages_failed, 1);
    }

    #[tokio::test]
    async fn test_metrics_timing() {
        let mut metrics = ProcessorMetrics::new();
        
        assert!(metrics.should_log_stats(0));
        assert!(!metrics.should_log_stats(60));
        
        metrics.reset_stats_timer();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(metrics.should_log_stats(0));
    }
}