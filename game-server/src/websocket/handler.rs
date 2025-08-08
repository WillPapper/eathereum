use crate::{
    error::{Result, ServerError},
    websocket::client_manager::ClientManager,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};
use warp::{Filter, ws::{Message, WebSocket}};

pub async fn handle_connection(
    ws: WebSocket,
    client_id: String,
    client_manager: Arc<ClientManager>,
) {
    info!("New WebSocket connection: {}", client_id);
    
    let (mut ws_sender, mut ws_receiver) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    // Register client with manager
    if let Err(e) = client_manager.add_client(client_id.clone(), tx).await {
        error!("Failed to add client {}: {}", client_id, e);
        return;
    }
    
    // Send welcome message
    let welcome = serde_json::json!({
        "type": "connected",
        "client_id": &client_id,
        "message": "Connected to Game Server WebSocket"
    });
    
    if let Err(e) = ws_sender.send(Message::text(welcome.to_string())).await {
        warn!("Failed to send welcome message to {}: {}", client_id, e);
        client_manager.remove_client(&client_id).await.ok();
        return;
    }
    
    // Spawn task to send messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });
    
    // Handle incoming messages from client
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                if let Err(e) = handle_client_message(msg, &client_id, &client_manager).await {
                    error!("Error handling message from {}: {}", client_id, e);
                }
            }
            Err(e) => {
                error!("WebSocket error for client {}: {}", client_id, e);
                break;
            }
        }
    }
    
    // Cleanup on disconnect
    info!("Client {} disconnecting", client_id);
    send_task.abort();
    client_manager.remove_client(&client_id).await.ok();
}

async fn handle_client_message(
    msg: Message,
    client_id: &str,
    client_manager: &Arc<ClientManager>,
) -> Result<()> {
    if msg.is_text() {
        let text = msg.to_str().unwrap_or("");
        debug!("Received text from {}: {}", client_id, text);
        
        // Handle specific commands
        if text == "ping" {
            client_manager
                .send_to_client(client_id, Message::text("pong"))
                .await?;
        } else if text == "stats" {
            let stats = get_connection_stats(client_manager).await;
            client_manager
                .send_to_client(client_id, Message::text(stats))
                .await?;
        }
        // You can add more command handlers here
    } else if msg.is_binary() {
        debug!("Received binary from {}: {} bytes", client_id, msg.as_bytes().len());
        // Handle binary messages if needed
    } else if msg.is_ping() {
        debug!("Received ping from {}", client_id);
        client_manager
            .send_to_client(client_id, Message::pong(msg.into_bytes()))
            .await?;
    } else if msg.is_pong() {
        debug!("Received pong from {}", client_id);
        // Update client activity on pong
    } else if msg.is_close() {
        info!("Client {} requested close", client_id);
        return Err(ServerError::ClientDisconnected {
            id: client_id.to_string(),
        });
    }
    
    Ok(())
}

async fn get_connection_stats(client_manager: &Arc<ClientManager>) -> String {
    let count = client_manager.get_client_count().await;
    let stats = serde_json::json!({
        "type": "stats",
        "connected_clients": count,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    stats.to_string()
}

pub fn with_client_manager(
    client_manager: Arc<ClientManager>,
) -> impl warp::Filter<Extract = (Arc<ClientManager>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || client_manager.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WebSocketConfig;

    #[test]
    fn test_welcome_message() {
        let client_id = "test-client-123";
        let welcome = serde_json::json!({
            "type": "connected",
            "client_id": client_id,
            "message": "Connected to Game Server WebSocket"
        });
        
        let json_str = welcome.to_string();
        assert!(json_str.contains("connected"));
        assert!(json_str.contains(client_id));
    }

    #[tokio::test]
    async fn test_connection_stats() {
        let config = WebSocketConfig {
            port: 8080,
            cors_origins: vec!["*".to_string()],
            client_timeout_secs: 300,
            ping_interval_secs: 30,
        };
        
        let client_manager = Arc::new(ClientManager::new(config));
        let stats = get_connection_stats(&client_manager).await;
        
        assert!(stats.contains("\"connected_clients\":0"));
        assert!(stats.contains("\"type\":\"stats\""));
    }
}