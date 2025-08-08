use alloy::primitives::Address;

#[derive(Debug, thiserror::Error)]
pub enum MonitorError {
    #[error("RPC error: {0}")]
    Rpc(String),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Parse error for transaction: {0}")]
    Parse(String),

    #[error("Connection lost to {service}: {details}")]
    ConnectionLost { service: String, details: String },

    #[error("Block processing error at block {block}: {details}")]
    BlockProcessing { block: u64, details: String },

    #[error("Token not found: {0}")]
    TokenNotFound(Address),

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Channel send error: {0}")]
    ChannelSend(String),

    #[error("Timeout error: operation timed out after {seconds} seconds")]
    Timeout { seconds: u64 },

    #[error("Shutdown requested")]
    Shutdown,

    #[error("Other error: {0}")]
    Other(String),
}

impl From<alloy::transports::TransportError> for MonitorError {
    fn from(err: alloy::transports::TransportError) -> Self {
        MonitorError::Rpc(err.to_string())
    }
}

impl From<eyre::Report> for MonitorError {
    fn from(err: eyre::Report) -> Self {
        MonitorError::Other(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, MonitorError>;

pub struct ErrorContext {
    pub operation: String,
    pub attempts: u32,
    pub will_retry: bool,
}

impl ErrorContext {
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            operation: operation.into(),
            attempts: 0,
            will_retry: false,
        }
    }

    pub fn with_retry(mut self, attempts: u32) -> Self {
        self.attempts = attempts;
        self.will_retry = attempts > 0;
        self
    }

    pub fn log_error(&self, error: &MonitorError) {
        use tracing::{error, warn};

        let retry_msg = if self.will_retry {
            format!(" (will retry, {} attempts remaining)", self.attempts)
        } else {
            String::new()
        };

        match error {
            MonitorError::Shutdown => {
                // Don't log shutdown as error
                tracing::info!("Operation '{}' interrupted by shutdown", self.operation);
            }
            MonitorError::ConnectionLost { .. } | MonitorError::Timeout { .. } => {
                warn!(
                    "Operation '{}' failed: {}{}",
                    self.operation, error, retry_msg
                );
            }
            _ => {
                error!(
                    "Operation '{}' failed: {}{}",
                    self.operation, error, retry_msg
                );
            }
        }
    }
}

pub trait ResultExt<T> {
    fn with_context(self, context: ErrorContext) -> Result<T>;
}

impl<T> ResultExt<T> for Result<T> {
    fn with_context(self, context: ErrorContext) -> Result<T> {
        if let Err(ref e) = self {
            context.log_error(e);
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = MonitorError::ConnectionLost {
            service: "Redis".to_string(),
            details: "Connection refused".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "Connection lost to Redis: Connection refused"
        );

        let err = MonitorError::BlockProcessing {
            block: 12345,
            details: "Failed to fetch logs".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "Block processing error at block 12345: Failed to fetch logs"
        );
    }

    #[test]
    fn test_error_context() {
        let context = ErrorContext::new("fetch_block").with_retry(3);
        assert_eq!(context.operation, "fetch_block");
        assert_eq!(context.attempts, 3);
        assert!(context.will_retry);
    }
}
