use eyre::Result;
use std::sync::Arc;
use tracing::error;

mod config;
mod health;
mod redis_consumer;
mod transaction;
mod websocket;

use config::Config;
use redis_consumer::RedisConsumer;
use websocket::{ClientManager, WebSocketServer};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    tracing_subscriber::fmt::init();

    tracing::info!("Starting Game Server");

    let config = Arc::new(Config::from_env());
    config.log_config();

    let client_manager = Arc::new(ClientManager::new());
    
    let mut redis_consumer = RedisConsumer::new(config.clone(), client_manager.clone()).await?;

    let redis_handle = tokio::spawn(async move {
        if let Err(e) = redis_consumer.start_consuming().await {
            error!("Redis stream consumer error: {:?}", e);
        }
    });

    let health_port = config.health_port;
    let health_handle = tokio::spawn(health::start_health_server(health_port));

    let ws_server = WebSocketServer::new(config.websocket_port, client_manager);
    ws_server.start().await;

    redis_handle.abort();
    health_handle.abort();

    Ok(())
}