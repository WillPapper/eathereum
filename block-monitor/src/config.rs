use alloy::primitives::Address;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub rpc: RpcConfig,
    pub redis: RedisConfig,
    pub chain: ChainConfig,
    pub monitoring: MonitoringConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcConfig {
    pub url: String,
    pub timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: Option<String>,
    pub stream_key: String,
    pub max_stream_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub network: String,
    pub poll_interval_secs: u64,
    pub stablecoins: Vec<TokenConfig>,
    pub start_block: Option<u64>,
    pub blocks_per_batch: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenConfig {
    pub symbol: String,
    pub address: Address,
    pub decimals: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub max_retry_attempts: u32,
    pub initial_backoff_secs: u64,
    pub max_backoff_secs: u64,
    pub batch_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub websocket_port: u16,
    pub health_port: u16,
    pub broadcast_capacity: usize,
}

impl Config {
    pub fn from_env() -> eyre::Result<Self> {
        Ok(Config {
            rpc: RpcConfig {
                url: env::var("RPC_URL")
                    .unwrap_or_else(|_| "https://base.llamarpc.com".to_string()),
                timeout_secs: env::var("RPC_TIMEOUT_SECS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
            },
            redis: RedisConfig {
                url: env::var("REDIS_URL").ok(),
                stream_key: env::var("REDIS_STREAM_KEY")
                    .unwrap_or_else(|_| "stablecoin:transactions".to_string()),
                max_stream_length: env::var("REDIS_MAX_STREAM_LENGTH")
                    .unwrap_or_else(|_| "10000".to_string())
                    .parse()?,
            },
            chain: ChainConfig {
                network: env::var("NETWORK").unwrap_or_else(|_| "base".to_string()),
                poll_interval_secs: env::var("POLL_INTERVAL_SECS")
                    .unwrap_or_else(|_| "2".to_string())
                    .parse()?,
                stablecoins: Self::default_stablecoins(),
                start_block: env::var("START_BLOCK").ok().and_then(|s| s.parse().ok()),
                blocks_per_batch: env::var("BLOCKS_PER_BATCH")
                    .unwrap_or_else(|_| "10".to_string())
                    .parse()?,
            },
            monitoring: MonitoringConfig {
                max_retry_attempts: env::var("MAX_RETRY_ATTEMPTS")
                    .unwrap_or_else(|_| "3".to_string())
                    .parse()?,
                initial_backoff_secs: env::var("INITIAL_BACKOFF_SECS")
                    .unwrap_or_else(|_| "1".to_string())
                    .parse()?,
                max_backoff_secs: env::var("MAX_BACKOFF_SECS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
                batch_size: env::var("BATCH_SIZE")
                    .unwrap_or_else(|_| "100".to_string())
                    .parse()?,
            },
            server: ServerConfig {
                websocket_port: env::var("WS_PORT")
                    .unwrap_or_else(|_| "8080".to_string())
                    .parse()?,
                health_port: env::var("HEALTH_PORT")
                    .unwrap_or_else(|_| "8081".to_string())
                    .parse()?,
                broadcast_capacity: env::var("BROADCAST_CAPACITY")
                    .unwrap_or_else(|_| "100".to_string())
                    .parse()?,
            },
        })
    }

    fn default_stablecoins() -> Vec<TokenConfig> {
        vec![
            TokenConfig {
                symbol: "USDC".to_string(),
                address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
                    .parse()
                    .expect("Valid USDC address"),
                decimals: 6,
            },
            TokenConfig {
                symbol: "USDT".to_string(),
                address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
                    .parse()
                    .expect("Valid USDT address"),
                decimals: 6,
            },
            TokenConfig {
                symbol: "DAI".to_string(),
                address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
                    .parse()
                    .expect("Valid DAI address"),
                decimals: 18,
            },
        ]
    }

    pub fn validate(&self) -> eyre::Result<()> {
        if self.chain.poll_interval_secs == 0 {
            return Err(eyre::eyre!("Poll interval must be greater than 0"));
        }

        if self.chain.stablecoins.is_empty() {
            return Err(eyre::eyre!("At least one stablecoin must be configured"));
        }

        if self.monitoring.max_retry_attempts == 0 {
            return Err(eyre::eyre!("Max retry attempts must be greater than 0"));
        }

        if self.server.broadcast_capacity == 0 {
            return Err(eyre::eyre!("Broadcast capacity must be greater than 0"));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let mut config = Config::from_env().unwrap();
        assert!(config.validate().is_ok());

        config.chain.poll_interval_secs = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_default_stablecoins() {
        let stablecoins = Config::default_stablecoins();
        assert_eq!(stablecoins.len(), 3);
        assert_eq!(stablecoins[0].symbol, "USDC");
        assert_eq!(stablecoins[0].decimals, 6);
    }
}
