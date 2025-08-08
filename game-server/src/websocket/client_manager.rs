use crate::{
    config::WebSocketConfig,
    error::{Result, ServerError},
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, info, warn};
use warp::ws::Message;

#[derive(Clone)]
pub struct Client {
    #[allow(dead_code)]
    pub id: String,
    pub sender: mpsc::UnboundedSender<Message>,
    #[allow(dead_code)]
    pub connected_at: Instant,
    pub last_activity: Arc<RwLock<Instant>>,
}

impl Client {
    pub fn new(id: String, sender: mpsc::UnboundedSender<Message>) -> Self {
        let now = Instant::now();
        Self {
            id,
            sender,
            connected_at: now,
            last_activity: Arc::new(RwLock::new(now)),
        }
    }

    pub async fn update_activity(&self) {
        *self.last_activity.write().await = Instant::now();
    }

    pub async fn is_active(&self, timeout_secs: u64) -> bool {
        let last_activity = *self.last_activity.read().await;
        last_activity.elapsed().as_secs() < timeout_secs
    }
}

pub struct ClientManager {
    clients: Arc<RwLock<HashMap<String, Client>>>,
    config: WebSocketConfig,
}

impl ClientManager {
    pub fn new(config: WebSocketConfig) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    pub async fn add_client(
        &self,
        id: String,
        sender: mpsc::UnboundedSender<Message>,
    ) -> Result<()> {
        let client = Client::new(id.clone(), sender);

        let mut clients = self.clients.write().await;
        if clients.contains_key(&id) {
            warn!("Client {} already exists, replacing", id);
        }

        clients.insert(id.clone(), client);
        info!("Client {} connected. Total clients: {}", id, clients.len());

        Ok(())
    }

    pub async fn remove_client(&self, id: &str) -> Result<()> {
        let mut clients = self.clients.write().await;

        if clients.remove(id).is_some() {
            info!(
                "Client {} disconnected. Total clients: {}",
                id,
                clients.len()
            );
        } else {
            debug!("Client {} was not in the list", id);
        }

        Ok(())
    }

    pub async fn broadcast(&self, message: &str) -> BroadcastResult {
        let clients = self.clients.read().await;
        let mut successful = 0;
        let mut failed = Vec::new();

        for (id, client) in clients.iter() {
            match client.sender.send(Message::text(message.to_string())) {
                Ok(_) => {
                    successful += 1;
                }
                Err(_) => {
                    warn!("Failed to send message to client {}", id);
                    failed.push(id.clone());
                }
            }
        }

        debug!("Broadcast to {}/{} clients", successful, clients.len());

        // Clean up failed clients
        if !failed.is_empty() {
            drop(clients); // Release read lock
            for id in &failed {
                self.remove_client(id).await.ok();
            }
        }

        BroadcastResult { successful, failed }
    }

    pub async fn send_to_client(&self, client_id: &str, message: Message) -> Result<()> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(client_id) {
            client
                .sender
                .send(message)
                .map_err(|_| ServerError::ClientDisconnected {
                    id: client_id.to_string(),
                })?;
            client.update_activity().await;
            Ok(())
        } else {
            Err(ServerError::ClientDisconnected {
                id: client_id.to_string(),
            })
        }
    }

    pub async fn get_client_count(&self) -> usize {
        self.clients.read().await.len()
    }

    #[allow(dead_code)]
    pub async fn get_client_ids(&self) -> Vec<String> {
        self.clients.read().await.keys().cloned().collect()
    }

    pub async fn cleanup_inactive(&self) -> Result<Vec<String>> {
        let timeout_secs = self.config.client_timeout_secs;
        let clients = self.clients.read().await;
        let mut inactive_ids = Vec::new();

        for (id, client) in clients.iter() {
            if !client.is_active(timeout_secs).await {
                inactive_ids.push(id.clone());
            }
        }

        drop(clients); // Release read lock

        for id in &inactive_ids {
            info!("Removing inactive client: {}", id);
            self.remove_client(id).await.ok();
        }

        Ok(inactive_ids)
    }

    pub async fn ping_all(&self) -> BroadcastResult {
        let clients = self.clients.read().await;
        let mut successful = 0;
        let mut failed = Vec::new();

        for (id, client) in clients.iter() {
            match client.sender.send(Message::ping(vec![])) {
                Ok(_) => successful += 1,
                Err(_) => failed.push(id.clone()),
            }
        }

        drop(clients);

        // Clean up failed clients
        for id in &failed {
            self.remove_client(id).await.ok();
        }

        BroadcastResult { successful, failed }
    }
}

pub struct BroadcastResult {
    pub successful: usize,
    pub failed: Vec<String>,
}

impl BroadcastResult {
    #[allow(dead_code)]
    pub fn all_successful(&self) -> bool {
        self.failed.is_empty()
    }

    #[allow(dead_code)]
    pub fn success_rate(&self) -> f64 {
        if self.successful + self.failed.len() == 0 {
            0.0
        } else {
            self.successful as f64 / (self.successful + self.failed.len()) as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_manager() {
        let config = WebSocketConfig {
            port: 8080,
            cors_origins: vec!["*".to_string()],
            client_timeout_secs: 300,
            ping_interval_secs: 30,
        };

        let manager = ClientManager::new(config);

        // Add a client
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.add_client("client1".to_string(), tx).await.unwrap();

        assert_eq!(manager.get_client_count().await, 1);

        // Broadcast a message
        let result = manager.broadcast("test message").await;
        assert_eq!(result.successful, 1);
        assert_eq!(result.failed.len(), 0);

        // Check message received
        if let Some(msg) = rx.recv().await {
            assert_eq!(msg.to_str().unwrap(), "test message");
        }

        // Remove client
        manager.remove_client("client1").await.unwrap();
        assert_eq!(manager.get_client_count().await, 0);
    }

    #[tokio::test]
    async fn test_broadcast_result() {
        let result = BroadcastResult {
            successful: 8,
            failed: vec!["client1".to_string(), "client2".to_string()],
        };

        assert!(!result.all_successful());
        assert_eq!(result.success_rate(), 0.8);
    }
}
