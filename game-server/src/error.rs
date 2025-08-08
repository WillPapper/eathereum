#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum ServerError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Message parsing error: {0}")]
    Parse(String),

    #[error("Client disconnected: {id}")]
    ClientDisconnected { id: String },

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Channel send error: {0}")]
    ChannelSend(String),

    #[error("Timeout error: operation timed out after {seconds} seconds")]
    Timeout { seconds: u64 },

    #[error("Service unavailable: {service}")]
    ServiceUnavailable { service: String },

    #[error("Other error: {0}")]
    Other(String),
}

impl From<Box<dyn std::error::Error>> for ServerError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        ServerError::Other(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ServerError>;

pub struct ErrorContext {
    pub operation: String,
    pub retryable: bool,
    pub severity: ErrorSeverity,
}

#[derive(Debug, Clone, Copy)]
pub enum ErrorSeverity {
    #[allow(dead_code)]
    Info,
    Warning,
    Error,
    Critical,
}

impl ErrorContext {
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            operation: operation.into(),
            retryable: false,
            severity: ErrorSeverity::Error,
        }
    }

    pub fn retryable(mut self) -> Self {
        self.retryable = true;
        self
    }

    pub fn with_severity(mut self, severity: ErrorSeverity) -> Self {
        self.severity = severity;
        self
    }

    pub fn log(&self, error: &ServerError) {
        use tracing::{error, info, warn};

        let retry_msg = if self.retryable { " (will retry)" } else { "" };

        match self.severity {
            ErrorSeverity::Info => {
                info!(
                    "Operation '{}' info: {}{}",
                    self.operation, error, retry_msg
                );
            }
            ErrorSeverity::Warning => {
                warn!(
                    "Operation '{}' warning: {}{}",
                    self.operation, error, retry_msg
                );
            }
            ErrorSeverity::Error => {
                error!(
                    "Operation '{}' failed: {}{}",
                    self.operation, error, retry_msg
                );
            }
            ErrorSeverity::Critical => {
                error!(
                    "CRITICAL: Operation '{}' failed: {}{}",
                    self.operation, error, retry_msg
                );
            }
        }
    }
}

pub trait ErrorExt {
    fn is_retryable(&self) -> bool;
    fn should_reconnect(&self) -> bool;
}

impl ErrorExt for ServerError {
    fn is_retryable(&self) -> bool {
        matches!(
            self,
            ServerError::Redis(_)
                | ServerError::Timeout { .. }
                | ServerError::ServiceUnavailable { .. }
        )
    }

    fn should_reconnect(&self) -> bool {
        matches!(
            self,
            ServerError::Redis(_)
                | ServerError::ClientDisconnected { .. }
                | ServerError::ServiceUnavailable { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = ServerError::ClientDisconnected {
            id: "client-123".to_string(),
        };
        assert_eq!(err.to_string(), "Client disconnected: client-123");

        let err = ServerError::Timeout { seconds: 30 };
        assert_eq!(
            err.to_string(),
            "Timeout error: operation timed out after 30 seconds"
        );
    }

    #[test]
    fn test_error_retryable() {
        let redis_err = ServerError::Redis(redis::RedisError::from(std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            "Connection refused",
        )));
        assert!(redis_err.is_retryable());

        let parse_err = ServerError::Parse("Invalid format".to_string());
        assert!(!parse_err.is_retryable());
    }
}
