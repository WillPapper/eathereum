use alloy::providers::ProviderBuilder;
use eyre::Result;
use std::env;
use tokio::sync::broadcast;
use tracing::info;

mod blockchain;
mod config;
mod health_server;
mod monitor;
mod redis_publisher;
mod transaction;
mod websocket_server;

use blockchain::BlockchainMonitor;
use config::get_stablecoin_map;
use health_server::HealthServer;
use monitor::StablecoinMonitor;
use redis_publisher::RedisPublisher;
use transaction::TransactionData;
use websocket_server::WebSocketServer;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    init_tracing();

    let rpc_url = get_rpc_url()?;
    log_startup_info(&rpc_url);

    let (tx_broadcaster, _) = broadcast::channel::<TransactionData>(100);

    let provider = ProviderBuilder::new().on_http(rpc_url.parse()?).boxed();
    let blockchain = BlockchainMonitor::new(Box::new(provider), get_stablecoin_map());

    let redis_url = env::var("REDIS_URL").ok();
    let redis_publisher = RedisPublisher::new(redis_url).await;

    let mut monitor =
        StablecoinMonitor::new(blockchain, redis_publisher, tx_broadcaster.clone()).await?;

    let ws_port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let ws_server = WebSocketServer::new(ws_port, tx_broadcaster);
    let ws_handle = tokio::spawn(async move { ws_server.start().await });

    let health_port = env::var("HEALTH_PORT").unwrap_or_else(|_| "8081".to_string());
    let health_server = HealthServer::new(health_port);
    let health_handle = tokio::spawn(async move { health_server.start().await });

    let monitor_handle = tokio::spawn(async move {
        monitor.start().await;
    });

    let shutdown = tokio::signal::ctrl_c();

    tokio::select! {
        _ = ws_handle => {
            tracing::error!("WebSocket server stopped");
        }
        _ = health_handle => {
            tracing::error!("Health server stopped");
        }
        _ = monitor_handle => {
            tracing::error!("Monitor stopped");
        }
        _ = shutdown => {
            info!("Received shutdown signal, stopping gracefully...");
        }
    }

    info!("Server shutdown complete");
    Ok(())
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();
}

fn get_rpc_url() -> Result<String> {
    let rpc_url = env::var("RPC_URL")
        .or_else(|_| env::var("ALCHEMY_RPC_URL"))
        .unwrap_or_else(|_| "https://mainnet.base.org".to_string());

    if rpc_url.contains("YOUR_API_KEY")
        || rpc_url.contains("YOUR_PROJECT_ID")
        || rpc_url.contains("YOUR_KEY")
    {
        tracing::error!(
            "Please set RPC_URL environment variable with your Base network RPC endpoint"
        );
        tracing::error!(
            "You can use providers like Alchemy, Infura, QuickNode, or the public Base RPC"
        );
        std::process::exit(1);
    }

    Ok(rpc_url)
}

fn log_startup_info(rpc_url: &str) {
    info!("Starting Block Monitor for Base Network");
    info!("RPC URL: {}", rpc_url);
    info!("Monitoring stablecoins:");
    info!("  - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    info!("  - USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    info!("  - DAI:  0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb");
}
