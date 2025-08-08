use crate::{domain::MonitorMetrics, error::Result};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use warp::{http::StatusCode, Filter, Rejection, Reply};

pub struct HealthServer {
    port: u16,
    metrics: Arc<RwLock<MonitorMetrics>>,
}

impl HealthServer {
    pub fn new(port: u16) -> (Self, Arc<RwLock<MonitorMetrics>>) {
        let metrics = Arc::new(RwLock::new(MonitorMetrics::default()));
        (
            Self {
                port,
                metrics: metrics.clone(),
            },
            metrics,
        )
    }

    pub async fn run(self) -> Result<()> {
        let health = warp::path("health")
            .and(warp::get())
            .map(|| warp::reply::json(&serde_json::json!({"status": "healthy"})));

        let metrics = warp::path("metrics")
            .and(warp::get())
            .and(with_metrics(self.metrics.clone()))
            .and_then(get_metrics);

        let routes = health.or(metrics);

        info!("Health server listening on http://0.0.0.0:{}", self.port);

        warp::serve(routes).run(([0, 0, 0, 0], self.port)).await;

        Ok(())
    }
}

fn with_metrics(
    metrics: Arc<RwLock<MonitorMetrics>>,
) -> impl Filter<Extract = (Arc<RwLock<MonitorMetrics>>,), Error = std::convert::Infallible> + Clone
{
    warp::any().map(move || metrics.clone())
}

async fn get_metrics(
    metrics: Arc<RwLock<MonitorMetrics>>,
) -> std::result::Result<impl Reply, Rejection> {
    let metrics = metrics.read().await;

    let response = serde_json::json!({
        "blocks_processed": metrics.blocks_processed,
        "transactions_found": metrics.transactions_found,
        "last_block_processed": metrics.last_block_processed,
        "errors_count": metrics.errors_count,
        "redis_publishes": metrics.redis_publishes,
        "websocket_broadcasts": metrics.websocket_broadcasts,
    });

    Ok(warp::reply::with_status(
        warp::reply::json(&response),
        StatusCode::OK,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_server_creation() {
        let (server, metrics) = HealthServer::new(8081);
        assert_eq!(server.port, 8081);

        // Update metrics
        {
            let mut m = metrics.write().await;
            m.record_block(100);
            m.record_transactions(5);
        }

        // Read metrics
        {
            let m = metrics.read().await;
            assert_eq!(m.blocks_processed, 1);
            assert_eq!(m.transactions_found, 5);
            assert_eq!(m.last_block_processed, 100);
        }
    }
}
