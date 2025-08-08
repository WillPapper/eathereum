use crate::{
    config::HealthConfig,
    error::Result,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use warp::{http::StatusCode, Filter, Rejection, Reply};

#[derive(Debug, Clone, serde::Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub timestamp: String,
    pub redis_connected: bool,
    pub websocket_clients: usize,
    pub messages_processed: u64,
}

pub struct HealthServer {
    config: HealthConfig,
    status: Arc<RwLock<HealthStatus>>,
}

impl HealthServer {
    pub fn new(config: HealthConfig) -> (Self, Arc<RwLock<HealthStatus>>) {
        let status = Arc::new(RwLock::new(HealthStatus {
            status: "healthy".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            redis_connected: false,
            websocket_clients: 0,
            messages_processed: 0,
        }));
        
        (
            Self {
                config,
                status: status.clone(),
            },
            status,
        )
    }

    pub async fn run(self) -> Result<()> {
        let path = self.config.path.trim_start_matches('/').to_string();
        let health = warp::path(path)
            .and(warp::get())
            .and(with_status(self.status.clone()))
            .and_then(get_health);

        let routes = health
            .with(warp::cors().allow_any_origin());

        info!("Health server listening on http://0.0.0.0:{}", self.config.port);
        
        warp::serve(routes)
            .run(([0, 0, 0, 0], self.config.port))
            .await;

        Ok(())
    }
}

fn with_status(
    status: Arc<RwLock<HealthStatus>>,
) -> impl Filter<Extract = (Arc<RwLock<HealthStatus>>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || status.clone())
}

async fn get_health(
    status: Arc<RwLock<HealthStatus>>,
) -> std::result::Result<impl Reply, Rejection> {
    let health = status.read().await;
    
    let response = serde_json::json!({
        "status": &health.status,
        "timestamp": &health.timestamp,
        "services": {
            "redis": health.redis_connected,
            "websocket": {
                "connected_clients": health.websocket_clients,
            },
        },
        "metrics": {
            "messages_processed": health.messages_processed,
        },
    });

    let status_code = if health.status == "healthy" {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    Ok(warp::reply::with_status(
        warp::reply::json(&response),
        status_code,
    ))
}

pub async fn update_health_status(
    status: Arc<RwLock<HealthStatus>>,
    redis_connected: bool,
    websocket_clients: usize,
    messages_processed: u64,
) {
    let mut health = status.write().await;
    health.timestamp = chrono::Utc::now().to_rfc3339();
    health.redis_connected = redis_connected;
    health.websocket_clients = websocket_clients;
    health.messages_processed = messages_processed;
    
    // Determine overall health
    health.status = if redis_connected {
        "healthy".to_string()
    } else {
        "degraded".to_string()
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_status() {
        let config = HealthConfig {
            port: 8081,
            path: "/health".to_string(),
        };
        
        let (server, status) = HealthServer::new(config);
        
        // Update health status
        update_health_status(status.clone(), true, 5, 100).await;
        
        // Check status
        let health = status.read().await;
        assert_eq!(health.status, "healthy");
        assert!(health.redis_connected);
        assert_eq!(health.websocket_clients, 5);
        assert_eq!(health.messages_processed, 100);
    }

    #[tokio::test]
    async fn test_degraded_status() {
        let config = HealthConfig {
            port: 8081,
            path: "/health".to_string(),
        };
        
        let (_server, status) = HealthServer::new(config);
        
        // Update with Redis disconnected
        update_health_status(status.clone(), false, 10, 200).await;
        
        // Check status
        let health = status.read().await;
        assert_eq!(health.status, "degraded");
        assert!(!health.redis_connected);
    }
}