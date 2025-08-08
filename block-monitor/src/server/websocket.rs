use crate::error::{MonitorError, Result};
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error, info, warn};

pub struct WebSocketServer {
    port: u16,
    receiver: broadcast::Receiver<String>,
}

impl WebSocketServer {
    pub fn new(port: u16, receiver: broadcast::Receiver<String>) -> Self {
        Self { port, receiver }
    }

    pub async fn run(self) -> Result<()> {
        let addr: SocketAddr = ([0, 0, 0, 0], self.port).into();
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| MonitorError::WebSocket(format!("Failed to bind: {}", e)))?;

        info!("WebSocket server listening on ws://{}", addr);

        loop {
            tokio::select! {
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, peer_addr)) => {
                            debug!("New WebSocket connection from {}", peer_addr);
                            let rx = self.receiver.resubscribe();
                            tokio::spawn(handle_connection(stream, peer_addr, rx));
                        }
                        Err(e) => {
                            error!("Failed to accept connection: {}", e);
                        }
                    }
                }
                _ = tokio::signal::ctrl_c() => {
                    info!("WebSocket server shutting down");
                    break;
                }
            }
        }

        Ok(())
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer_addr: SocketAddr,
    mut receiver: broadcast::Receiver<String>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("WebSocket handshake failed for {}: {}", peer_addr, e);
            return;
        }
    };

    info!("WebSocket client connected: {}", peer_addr);
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Send initial connection message
    let welcome = serde_json::json!({
        "type": "connected",
        "message": "Connected to Stablecoin Monitor WebSocket"
    });

    if let Err(e) = ws_sender.send(Message::Text(welcome.to_string())).await {
        warn!("Failed to send welcome message to {}: {}", peer_addr, e);
        return;
    }

    // Handle incoming messages and broadcast updates
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages (ping/pong, close)
            Some(msg) = ws_receiver.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        debug!("Received text from {}: {}", peer_addr, text);
                        // Echo back or handle commands
                        if text == "ping" {
                            if let Err(e) = ws_sender.send(Message::Text("pong".to_string())).await {
                                error!("Failed to send pong: {}", e);
                                break;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        debug!("Client {} requested close", peer_addr);
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        if let Err(e) = ws_sender.send(Message::Pong(data)).await {
                            error!("Failed to send pong: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        error!("WebSocket error for {}: {}", peer_addr, e);
                        break;
                    }
                    _ => {}
                }
            }

            // Forward broadcast messages to client
            Ok(data) = receiver.recv() => {
                if let Err(e) = ws_sender.send(Message::Text(data)).await {
                    error!("Failed to send data to {}: {}", peer_addr, e);
                    break;
                }
            }
        }
    }

    info!("WebSocket client disconnected: {}", peer_addr);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::broadcast;

    #[tokio::test]
    async fn test_websocket_server_creation() {
        let (_tx, rx) = broadcast::channel(10);
        let server = WebSocketServer::new(8080, rx);
        assert_eq!(server.port, 8080);
    }
}
