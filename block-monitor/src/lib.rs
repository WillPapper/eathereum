pub mod config;
pub mod domain;
pub mod error;
pub mod monitor;
pub mod server;
pub mod services;

pub use config::Config;
pub use error::{MonitorError, Result};
pub use monitor::StablecoinMonitor;
pub use services::{BlockchainService, Publisher};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let config = Config::from_env().unwrap();
        assert!(config.validate().is_ok());
    }
}
