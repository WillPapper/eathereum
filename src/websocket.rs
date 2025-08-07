use alloy_primitives::{Address, U256};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures::{StreamExt, SinkExt};
use tokio::sync::mpsc;
use tracing::{info, error, warn};

/// Transaction data to send to visualizer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionData {
    pub stablecoin: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub block_number: u64,
    pub tx_hash: String,
}

/// WebSocket server for streaming transaction data to visualizer
pub struct WebSocketServer {
    addr: SocketAddr,
    rx: mpsc::UnboundedReceiver<TransactionData>,
}

impl WebSocketServer {
    /// Create a new WebSocket server
    pub fn new(addr: SocketAddr, rx: mpsc::UnboundedReceiver<TransactionData>) -> Self {
        Self { addr, rx }
    }
    
    /// Start the WebSocket server
    pub async fn start(mut self) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(&self.addr).await?;
        info!("WebSocket server listening on: {}", self.addr);
        
        // Store connected clients
        let (broadcast_tx, _) = tokio::sync::broadcast::channel::<TransactionData>(100);
        
        loop {
            tokio::select! {
                // Accept new connections
                Ok((stream, addr)) = listener.accept() => {
                    info!("New WebSocket connection from: {}", addr);
                    let mut broadcast_rx = broadcast_tx.subscribe();
                    
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, broadcast_rx).await {
                            error!("Error handling connection from {}: {}", addr, e);
                        }
                    });
                }
                
                // Receive transaction data and broadcast to all clients
                Some(tx_data) = self.rx.recv() => {
                    if let Err(e) = broadcast_tx.send(tx_data.clone()) {
                        // No receivers connected, that's okay
                        if broadcast_tx.receiver_count() > 0 {
                            warn!("Failed to broadcast transaction data: {}", e);
                        }
                    }
                }
            }
        }
    }
}

/// Handle individual WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    mut broadcast_rx: tokio::sync::broadcast::Receiver<TransactionData>,
) -> Result<(), Box<dyn std::error::Error>> {
    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    
    loop {
        tokio::select! {
            // Forward transaction data to client
            Ok(tx_data) = broadcast_rx.recv() => {
                let json = serde_json::to_string(&tx_data)?;
                ws_sender.send(Message::Text(json)).await?;
            }
            
            // Handle incoming messages from client (if any)
            Some(msg) = ws_receiver.next() => {
                match msg {
                    Ok(Message::Close(_)) | Err(_) => {
                        info!("Client disconnected");
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        ws_sender.send(Message::Pong(data)).await?;
                    }
                    _ => {}
                }
            }
        }
    }
    
    Ok(())
}

/// Helper function to convert ERC-20 transfer to WebSocket transaction data
pub fn create_transaction_data(
    stablecoin: &str,
    from: Address,
    to: Address,
    amount: U256,
    decimals: u8,
    block_number: u64,
    tx_hash: alloy_primitives::TxHash,
) -> TransactionData {
    TransactionData {
        stablecoin: stablecoin.to_string(),
        amount: format_amount(amount, decimals),
        from: format!("{:?}", from),
        to: format!("{:?}", to),
        block_number,
        tx_hash: format!("{:?}", tx_hash),
    }
}

/// Format token amount with decimals
fn format_amount(amount: U256, decimals: u8) -> String {
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