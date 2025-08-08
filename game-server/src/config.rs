use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub redis: RedisConfig,
    pub websocket: WebSocketConfig,
    pub consumer: ConsumerConfig,
    pub health: HealthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub stream_key: String,
    pub consumer_group: String,
    pub consumer_name: String,
    pub batch_size: usize,
    pub block_timeout_ms: u64,
    pub retry_delay_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketConfig {
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub client_timeout_secs: u64,
    pub ping_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerConfig {
    pub stats_interval_secs: u64,
    pub warning_interval_secs: u64,
    pub address_display_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    pub port: u16,
    pub path: String,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Config {
            redis: RedisConfig {
                url: env::var("REDIS_URL")
                    .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
                stream_key: env::var("REDIS_STREAM_KEY")
                    .unwrap_or_else(|_| "stablecoin:transactions".to_string()),
                consumer_group: env::var("CONSUMER_GROUP")
                    .unwrap_or_else(|_| "websocket-publisher".to_string()),
                consumer_name: env::var("CONSUMER_NAME")
                    .unwrap_or_else(|_| {
                        format!("consumer-{}", uuid::Uuid::new_v4().to_string())
                    }),
                batch_size: env::var("BATCH_SIZE")
                    .unwrap_or_else(|_| "10".to_string())
                    .parse()?,
                block_timeout_ms: env::var("BLOCK_TIMEOUT_MS")
                    .unwrap_or_else(|_| "1000".to_string())
                    .parse()?,
                retry_delay_secs: env::var("RETRY_DELAY_SECS")
                    .unwrap_or_else(|_| "1".to_string())
                    .parse()?,
            },
            websocket: WebSocketConfig {
                port: env::var("PORT")
                    .unwrap_or_else(|_| "8080".to_string())
                    .parse()?,
                cors_origins: env::var("CORS_ORIGINS")
                    .unwrap_or_else(|_| "*".to_string())
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect(),
                client_timeout_secs: env::var("CLIENT_TIMEOUT_SECS")
                    .unwrap_or_else(|_| "300".to_string())
                    .parse()?,
                ping_interval_secs: env::var("PING_INTERVAL_SECS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
            },
            consumer: ConsumerConfig {
                stats_interval_secs: env::var("STATS_INTERVAL_SECS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
                warning_interval_secs: env::var("WARNING_INTERVAL_SECS")
                    .unwrap_or_else(|_| "60".to_string())
                    .parse()?,
                address_display_length: env::var("ADDRESS_DISPLAY_LENGTH")
                    .unwrap_or_else(|_| "10".to_string())
                    .parse()?,
            },
            health: HealthConfig {
                port: env::var("HEALTH_PORT")
                    .unwrap_or_else(|_| "8081".to_string())
                    .parse()?,
                path: env::var("HEALTH_PATH")
                    .unwrap_or_else(|_| "/health".to_string()),
            },
        })
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.redis.batch_size == 0 {
            return Err("Batch size must be greater than 0".to_string());
        }
        
        if self.redis.block_timeout_ms == 0 {
            return Err("Block timeout must be greater than 0".to_string());
        }
        
        if self.websocket.port == 0 {
            return Err("WebSocket port must be valid".to_string());
        }
        
        if self.health.port == 0 {
            return Err("Health port must be valid".to_string());
        }
        
        Ok(())
    }

    pub fn mask_redis_url(&self) -> String {
        let url = &self.redis.url;
        if url.contains("@") {
            let parts: Vec<&str> = url.split('@').collect();
            if parts.len() > 1 {
                format!("redis://***@{}", parts[1])
            } else {
                "redis://***".to_string()
            }
        } else {
            url.clone()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let mut config = Config::from_env().unwrap();
        assert!(config.validate().is_ok());
        
        config.redis.batch_size = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_redis_url_masking() {
        let mut config = Config::from_env().unwrap();
        
        config.redis.url = "redis://user:password@localhost:6379".to_string();
        assert_eq!(config.mask_redis_url(), "redis://***@localhost:6379");
        
        config.redis.url = "redis://localhost:6379".to_string();
        assert_eq!(config.mask_redis_url(), "redis://localhost:6379");
    }
}