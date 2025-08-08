use std::env;

pub struct Config {
    pub redis_url: String,
    pub redis_stream_key: String,
    pub consumer_group: String,
    pub consumer_name: String,
    pub websocket_port: u16,
    pub health_port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string()),
            redis_stream_key: env::var("REDIS_STREAM_KEY")
                .unwrap_or_else(|_| "stablecoin:transactions".to_string()),
            consumer_group: env::var("CONSUMER_GROUP")
                .unwrap_or_else(|_| "websocket-publisher".to_string()),
            consumer_name: env::var("CONSUMER_NAME")
                .unwrap_or_else(|_| format!("consumer-{}", uuid::Uuid::new_v4())),
            websocket_port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            health_port: env::var("HEALTH_PORT")
                .unwrap_or_else(|_| "8081".to_string())
                .parse()
                .unwrap_or(8081),
        }
    }

    pub fn log_config(&self) {
        tracing::info!("Configuration:");
        tracing::info!("  Redis URL: {}", self.mask_redis_url());
        tracing::info!("  Stream Key: {}", self.redis_stream_key);
        tracing::info!("  Consumer Group: {}", self.consumer_group);
        tracing::info!("  WebSocket Port: {}", self.websocket_port);
        tracing::info!("  Health Port: {}", self.health_port);
    }

    fn mask_redis_url(&self) -> String {
        if self.redis_url.contains("@") {
            let parts: Vec<&str> = self.redis_url.split('@').collect();
            if parts.len() > 1 {
                format!("redis://***@{}", parts[1])
            } else {
                "redis://***".to_string()
            }
        } else {
            self.redis_url.clone()
        }
    }
}