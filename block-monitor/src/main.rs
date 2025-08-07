use alloy::{
    network::EthereumWallet,
    primitives::{address, Address, U256},
    providers::{Provider, ProviderBuilder},
    rpc::types::{Block, Transaction},
    sol,
    sol_types::SolCall,
};
use eyre::Result;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
    time::Duration,
};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{broadcast, RwLock},
    time,
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

// Known stablecoin addresses on Base network (Chain ID: 8453)
// Source: Base official token list and Base docs
// Verified on BaseScan: https://basescan.org/tokens
const USDC_ADDRESS: Address = address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC on Base
const USDT_ADDRESS: Address = address!("fde4C96c8593536E31F229EA8f37b2ADa2699bb2"); // USDT on Base
const DAI_ADDRESS: Address = address!("50c5725949A6F0c72E6C4a641F24049A917DB0Cb"); // DAI on Base

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE: &str =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Define ERC20 functions using sol! macro
sol! {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TransactionData {
    pub stablecoin: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub block_number: u64,
    pub tx_hash: String,
}

#[derive(Clone)]
struct StablecoinInfo {
    name: &'static str,
    decimals: u8,
}

struct StablecoinMonitor {
    provider: Arc<dyn Provider>,
    stablecoins: HashMap<Address, StablecoinInfo>,
    last_block: Arc<RwLock<u64>>,
    tx_broadcaster: broadcast::Sender<TransactionData>,
}

impl StablecoinMonitor {
    async fn new(
        rpc_url: String,
        tx_broadcaster: broadcast::Sender<TransactionData>,
    ) -> Result<Self> {
        // Create provider
        let provider = ProviderBuilder::new().on_http(rpc_url.parse()?).boxed();

        // Initialize stablecoin map with Base network stablecoins
        // These addresses are specific to Base network (not Ethereum mainnet)
        let mut stablecoins = HashMap::new();
        stablecoins.insert(
            USDC_ADDRESS,
            StablecoinInfo {
                name: "USDC",
                decimals: 6, // USDC uses 6 decimals on Base
            },
        );
        stablecoins.insert(
            USDT_ADDRESS,
            StablecoinInfo {
                name: "USDT",
                decimals: 6, // USDT uses 6 decimals on Base
            },
        );
        stablecoins.insert(
            DAI_ADDRESS,
            StablecoinInfo {
                name: "DAI",
                decimals: 18, // DAI uses 18 decimals on Base
            },
        );

        // Get current block number
        let current_block = provider.get_block_number().await?;

        Ok(Self {
            provider: Arc::new(provider),
            stablecoins,
            last_block: Arc::new(RwLock::new(current_block)),
            tx_broadcaster,
        })
    }

    async fn start_monitoring(&self) {
        // Create interval timer for polling every 2 seconds
        // This runs continuously as a background worker
        let mut interval = time::interval(Duration::from_secs(2));

        info!("Starting blockchain monitoring loop (polling every 2 seconds)");

        loop {
            interval.tick().await;

            if let Err(e) = self.check_new_blocks().await {
                error!("Error checking blocks: {}", e);
                // Continue running even on errors - don't crash the worker
            }
        }
    }

    async fn check_new_blocks(&self) -> Result<()> {
        // Get latest block number
        let latest_block = self.provider.get_block_number().await?;
        let mut last_processed = *self.last_block.read().await;

        // Process any new blocks
        while last_processed < latest_block {
            last_processed += 1;

            info!("Processing block {}", last_processed);

            // Get block with transactions
            if let Some(block) = self
                .provider
                .get_block_by_number(last_processed.into(), true)
                .await?
            {
                self.process_block(block).await?;
            }

            // Update last processed block
            *self.last_block.write().await = last_processed;
        }

        Ok(())
    }

    async fn process_block(&self, block: Block) -> Result<()> {
        let block_number = block.header.number.unwrap_or_default();

        // Process each transaction in the block
        for tx in block.transactions.into_transactions() {
            // Check if this is a transaction to one of our stablecoin contracts
            if let Some(to) = tx.to() {
                if let Some(stablecoin_info) = self.stablecoins.get(&to) {
                    // Parse the transaction
                    if let Some(tx_data) =
                        self.parse_stablecoin_transaction(&tx, to, stablecoin_info, block_number)
                    {
                        info!(
                            "Found {} transfer: {} -> {} amount: {}",
                            tx_data.stablecoin, tx_data.from, tx_data.to, tx_data.amount
                        );

                        // Broadcast to WebSocket clients
                        let _ = self.tx_broadcaster.send(tx_data);
                    }
                }
            }
        }

        Ok(())
    }

    fn parse_stablecoin_transaction(
        &self,
        tx: &Transaction,
        token_address: Address,
        stablecoin_info: &StablecoinInfo,
        block_number: u64,
    ) -> Option<TransactionData> {
        let input = tx.input();

        // Check if it's a transfer or transferFrom
        if input.len() < 4 {
            return None;
        }

        let selector = &input[0..4];

        // transfer(address,uint256) - 0xa9059cbb
        if selector == [0xa9, 0x05, 0x9c, 0xbb] && input.len() >= 68 {
            // Decode transfer
            if let Ok(decoded) = transferCall::abi_decode(&input, false) {
                let amount = self.format_amount(decoded.amount, stablecoin_info.decimals);
                return Some(TransactionData {
                    stablecoin: stablecoin_info.name.to_string(),
                    amount,
                    from: format!("{:?}", tx.from),
                    to: format!("{:?}", decoded.to),
                    block_number,
                    tx_hash: format!("{:?}", tx.hash),
                });
            }
        }

        // transferFrom(address,address,uint256) - 0x23b872dd
        if selector == [0x23, 0xb8, 0x72, 0xdd] && input.len() >= 100 {
            // Decode transferFrom
            if let Ok(decoded) = transferFromCall::abi_decode(&input, false) {
                let amount = self.format_amount(decoded.amount, stablecoin_info.decimals);
                return Some(TransactionData {
                    stablecoin: stablecoin_info.name.to_string(),
                    amount,
                    from: format!("{:?}", decoded.from),
                    to: format!("{:?}", decoded.to),
                    block_number,
                    tx_hash: format!("{:?}", tx.hash),
                });
            }
        }

        None
    }

    fn format_amount(&self, amount: U256, decimals: u8) -> String {
        let divisor = U256::from(10).pow(U256::from(decimals));
        let whole = amount / divisor;
        let fraction = amount % divisor;

        match decimals {
            6 => format!("{}.{:06}", whole, fraction),
            18 => format!("{}.{:018}", whole, fraction),
            n => {
                let fraction_str = format!("{:0width$}", fraction, width = n as usize);
                format!("{}.{}", whole, fraction_str)
            }
        }
    }
}

async fn handle_websocket(
    stream: TcpStream,
    addr: SocketAddr,
    mut rx: broadcast::Receiver<TransactionData>,
) -> Result<()> {
    info!("New WebSocket connection from: {}", addr);

    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    loop {
        tokio::select! {
            // Forward transaction data to client
            Ok(tx_data) = rx.recv() => {
                let json = serde_json::to_string(&tx_data)?;
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }

            // Handle incoming messages from client
            Some(msg) = ws_receiver.next() => {
                match msg {
                    Ok(Message::Close(_)) | Err(_) => {
                        info!("Client {} disconnected", addr);
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        let _ = ws_sender.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

async fn start_websocket_server(tx_broadcaster: broadcast::Sender<TransactionData>) -> Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    info!("WebSocket server listening on: {}", addr);

    loop {
        let (stream, addr) = listener.accept().await?;
        let rx = tx_broadcaster.subscribe();

        tokio::spawn(async move {
            if let Err(e) = handle_websocket(stream, addr, rx).await {
                error!("WebSocket error for {}: {}", addr, e);
            }
        });
    }
}

async fn start_health_server() -> Result<()> {
    use tokio::io::AsyncWriteExt;

    let health_port = env::var("HEALTH_PORT").unwrap_or_else(|_| "8081".to_string());
    let addr = format!("0.0.0.0:{}", health_port);
    let listener = TcpListener::bind(&addr).await?;
    info!("Health check server listening on: {}", addr);

    loop {
        let (mut stream, _) = listener.accept().await?;

        tokio::spawn(async move {
            let response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    // Set up graceful shutdown
    let shutdown = tokio::signal::ctrl_c();

    // Get RPC URL from environment or use default
    // MUST be a Base network RPC endpoint (not Ethereum mainnet)
    let rpc_url = env::var("RPC_URL")
        .or_else(|_| env::var("ALCHEMY_RPC_URL")) // Fallback for backward compatibility
        .unwrap_or_else(|_| "https://mainnet.base.org".to_string());

    if rpc_url.contains("YOUR_API_KEY")
        || rpc_url.contains("YOUR_PROJECT_ID")
        || rpc_url.contains("YOUR_KEY")
    {
        error!("Please set RPC_URL environment variable with your Base network RPC endpoint");
        error!("You can use providers like Alchemy, Infura, QuickNode, or the public Base RPC");
        std::process::exit(1);
    }

    info!("Starting Block Monitor for Base Network");
    info!("RPC URL: {}", rpc_url);
    info!("Monitoring stablecoins:");
    info!("  - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    info!("  - USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    info!("  - DAI:  0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb");

    // Create broadcast channel for transactions
    let (tx_broadcaster, _) = broadcast::channel::<TransactionData>(100);

    // Create monitor
    let monitor = StablecoinMonitor::new(rpc_url, tx_broadcaster.clone()).await?;

    // Start WebSocket server
    let ws_handle = tokio::spawn(start_websocket_server(tx_broadcaster));

    // Start health check server
    let health_handle = tokio::spawn(start_health_server());

    // Start monitoring
    let monitor_handle = tokio::spawn(async move {
        monitor.start_monitoring().await;
    });

    // Wait for tasks or shutdown signal
    tokio::select! {
        _ = ws_handle => {
            error!("WebSocket server stopped");
        }
        _ = health_handle => {
            error!("Health server stopped");
        }
        _ = monitor_handle => {
            error!("Monitor stopped");
        }
        _ = shutdown => {
            info!("Received shutdown signal, stopping gracefully...");
        }
    }

    info!("Server shutdown complete");
    Ok(())
}
