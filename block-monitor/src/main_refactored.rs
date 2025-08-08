mod config;
mod domain;
mod error;
mod monitor;
mod server;
mod services;

use alloy::providers::RootProvider;
use alloy::transports::http::{Client, Http};
use config::Config;
use error::Result;
use monitor::StablecoinMonitor;
use server::{HealthServer, WebSocketServer};
use services::{
    BlockchainService, CompositePublisher, LogPublisher, Publisher, RedisPublisher,
    WebSocketPublisher,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize environment and logging
    initialize_environment()?;
    
    // Load and validate configuration
    let config = Config::from_env()?;
    config.validate()?;
    
    info!("Starting Stablecoin Block Monitor");
    info!("Network: {}", config.chain.network);
    info!("Monitoring {} tokens", config.chain.stablecoins.len());
    
    // Create services
    let blockchain = create_blockchain_service(&config)?;
    let (publisher, ws_receiver) = create_publishers(&config).await?;
    
    // Create monitor
    let mut monitor = StablecoinMonitor::new(blockchain, publisher, config.clone());
    
    // Start servers
    let ws_server = WebSocketServer::new(config.server.websocket_port, ws_receiver);
    let (health_server, metrics) = HealthServer::new(config.server.health_port);
    
    // Spawn server tasks
    let ws_handle = tokio::spawn(async move {
        if let Err(e) = ws_server.run().await {
            error!("WebSocket server error: {}", e);
        }
    });
    
    let health_handle = tokio::spawn(async move {
        if let Err(e) = health_server.run().await {
            error!("Health server error: {}", e);
        }
    });
    
    // Run monitor
    let monitor_handle = tokio::spawn(async move {
        if let Err(e) = monitor.run().await {
            error!("Monitor error: {}", e);
        }
    });
    
    // Wait for all tasks
    tokio::select! {
        _ = monitor_handle => info!("Monitor stopped"),
        _ = ws_handle => info!("WebSocket server stopped"),
        _ = health_handle => info!("Health server stopped"),
    }
    
    info!("Stablecoin Block Monitor shutdown complete");
    Ok(())
}

fn initialize_environment() -> Result<()> {
    // Load .env file if present
    dotenv::dotenv().ok();
    
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("block_monitor=debug".parse().unwrap()),
        )
        .init();
    
    Ok(())
}

fn create_blockchain_service(config: &Config) -> Result<BlockchainService> {
    let provider = RootProvider::<Http<Client>>::new_http(
        config
            .rpc
            .url
            .parse()
            .map_err(|e| error::MonitorError::Config(format!("Invalid RPC URL: {}", e)))?,
    );
    
    BlockchainService::new(provider, config.chain.clone())
}

async fn create_publishers(
    config: &Config,
) -> Result<(CompositePublisher, tokio::sync::broadcast::Receiver<String>)> {
    let mut publishers: Vec<Box<dyn Publisher>> = vec![];
    
    // Always add log publisher
    publishers.push(Box::new(LogPublisher::new()));
    
    // Add Redis publisher if configured
    if let Some(redis_publisher) = RedisPublisher::new(&config.redis).await? {
        info!("Redis publisher initialized");
        publishers.push(Box::new(redis_publisher));
    } else {
        info!("Redis not configured, skipping Redis publisher");
    }
    
    // Add WebSocket publisher
    let (ws_publisher, ws_receiver) = WebSocketPublisher::new(config.server.broadcast_capacity);
    publishers.push(Box::new(ws_publisher));
    
    Ok((CompositePublisher::new(publishers), ws_receiver))
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