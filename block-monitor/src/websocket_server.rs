use eyre::Result;
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info};

use crate::transaction::TransactionData;

pub struct WebSocketServer {
    port: String,
    tx_broadcaster: broadcast::Sender<TransactionData>,
}

impl WebSocketServer {
    pub fn new(port: String, tx_broadcaster: broadcast::Sender<TransactionData>) -> Self {
        Self {
            port,
            tx_broadcaster,
        }
    }

    pub async fn start(&self) -> Result<()> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        info!("WebSocket server listening on: {}", addr);

        loop {
            let (stream, addr) = listener.accept().await?;
            let rx = self.tx_broadcaster.subscribe();

            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, addr, rx).await {
                    error!("WebSocket error for {}: {}", addr, e);
                }
            });
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    mut rx: broadcast::Receiver<TransactionData>,
) -> Result<()> {
    info!("New WebSocket connection from: {}", addr);

    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    loop {
        tokio::select! {
            Ok(tx_data) = rx.recv() => {
                let json = serde_json::to_string(&tx_data)?;
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }

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
