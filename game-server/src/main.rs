mod config;
mod error;
mod health;
mod message;
mod redis;
mod websocket;

use config::Config;
use error::{Result, ServerError};
use health::{update_health_status, HealthServer};
use message::MessageProcessor;
use redis::RedisConsumer;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;
use warp::Filter;
use websocket::{handle_connection, handler, ClientManager};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    init_logging();

    // Load configuration
    let config = Config::from_env()?;
    config.validate().map_err(ServerError::Config)?;

    info!("Starting Game Server");
    info!("Redis: {}", config.mask_redis_url());
    info!("WebSocket port: {}", config.websocket.port);
    info!("Health port: {}", config.health.port);

    // Initialize services
    let redis_consumer = RedisConsumer::new(config.redis.clone()).await?;
    let client_manager = Arc::new(ClientManager::new(config.websocket.clone()));

    // Create message processor
    let message_processor = MessageProcessor::new(
        redis_consumer,
        client_manager.clone(),
        config.consumer.clone(),
    );

    // Setup health server
    let (health_server, health_status) = HealthServer::new(config.health.clone());

    // Start background tasks
    let processor_handle = tokio::spawn(run_message_processor(
        message_processor,
        client_manager.clone(),
        health_status.clone(),
    ));

    let health_handle = tokio::spawn(health_server.run());

    let ping_handle = tokio::spawn(run_ping_task(
        client_manager.clone(),
        config.websocket.ping_interval_secs,
    ));

    // Setup WebSocket server
    let ws_route = warp::path("ws")
        .and(warp::ws())
        .and(handler::with_client_manager(client_manager.clone()))
        .map(|ws: warp::ws::Ws, client_manager| {
            ws.on_upgrade(move |socket| {
                let client_id = format!("client-{}", Uuid::new_v4());
                handle_connection(socket, client_id, client_manager)
            })
        });

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST"])
        .allow_headers(vec!["content-type"]);

    let routes = ws_route.with(cors);

    info!(
        "WebSocket server listening on ws://0.0.0.0:{}/ws",
        config.websocket.port
    );

    // Run WebSocket server
    let server = warp::serve(routes).run(([0, 0, 0, 0], config.websocket.port));

    // Wait for all tasks
    tokio::select! {
        _ = server => {
            info!("WebSocket server stopped");
        }
        result = processor_handle => {
            match result {
                Ok(Ok(_)) => info!("Message processor stopped"),
                Ok(Err(e)) => error!("Message processor error: {}", e),
                Err(e) => error!("Message processor panic: {}", e),
            }
        }
        result = health_handle => {
            match result {
                Ok(Ok(_)) => info!("Health server stopped"),
                Ok(Err(e)) => error!("Health server error: {}", e),
                Err(e) => error!("Health server panic: {}", e),
            }
        }
        _ = ping_handle => {
            info!("Ping task stopped");
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Shutdown signal received");
        }
    }

    info!("Game Server shutdown complete");
    Ok(())
}

fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("game_server=debug".parse().unwrap())
                .add_directive("warp=info".parse().unwrap()),
        )
        .init();
}

async fn run_message_processor(
    mut processor: MessageProcessor,
    client_manager: Arc<ClientManager>,
    health_status: Arc<tokio::sync::RwLock<health::HealthStatus>>,
) -> Result<()> {
    let mut health_interval = tokio::time::interval(tokio::time::Duration::from_secs(5));

    loop {
        tokio::select! {
            _ = health_interval.tick() => {
                let metrics = processor.get_metrics().await;
                let client_count = client_manager.get_client_count().await;

                update_health_status(
                    health_status.clone(),
                    true, // Redis connected (we're processing messages)
                    client_count,
                    metrics.messages_processed,
                ).await;
            }
            result = processor.run() => {
                return result;
            }
        }
    }
}

async fn run_ping_task(client_manager: Arc<ClientManager>, interval_secs: u64) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(interval_secs));

    loop {
        interval.tick().await;

        // Ping all clients
        let result = client_manager.ping_all().await;
        if !result.failed.is_empty() {
            info!("Removed {} inactive clients", result.failed.len());
        }

        // Clean up inactive clients
        if let Ok(inactive) = client_manager.cleanup_inactive().await {
            if !inactive.is_empty() {
                info!("Cleaned up {} inactive clients", inactive.len());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_loading() {
        let config = Config::from_env();
        assert!(config.is_ok());
    }
}
