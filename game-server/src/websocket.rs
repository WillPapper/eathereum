use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info};
use warp::ws::{Message, WebSocket};
use warp::Filter;

use crate::transaction::TransactionData;

pub type ClientId = String;
pub type ClientSender = mpsc::UnboundedSender<Message>;
pub type ClientsMap = Arc<RwLock<HashMap<ClientId, ClientSender>>>;

pub struct ClientManager {
    clients: ClientsMap,
}

impl ClientManager {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_client(&self, client_id: ClientId, sender: ClientSender) -> usize {
        let mut clients = self.clients.write().await;
        clients.insert(client_id.clone(), sender);
        let count = clients.len();
        info!(
            "🔌 Client {} connected (total clients: {})",
            client_id, count
        );
        count
    }

    pub async fn remove_client(&self, client_id: &str) -> usize {
        let mut clients = self.clients.write().await;
        clients.remove(client_id);
        let count = clients.len();
        info!(
            "🔌 Client {} disconnected (remaining clients: {})",
            client_id, count
        );
        count
    }

    pub async fn broadcast(&self, data: &TransactionData) {
        let message = match serde_json::to_string(data) {
            Ok(json) => Message::text(json),
            Err(e) => {
                error!("Failed to serialize data: {:?}", e);
                return;
            }
        };

        let clients = self.clients.read().await;
        let mut disconnected = Vec::new();

        for (id, tx) in clients.iter() {
            if tx.send(message.clone()).is_err() {
                disconnected.push(id.clone());
            }
        }

        drop(clients);

        if !disconnected.is_empty() {
            let mut clients = self.clients.write().await;
            for id in disconnected {
                clients.remove(&id);
                info!("Client {} disconnected during broadcast", id);
            }
        }
    }

    pub async fn client_count(&self) -> usize {
        self.clients.read().await.len()
    }
}

pub struct WebSocketServer {
    port: u16,
    client_manager: Arc<ClientManager>,
}

impl WebSocketServer {
    pub fn new(port: u16, client_manager: Arc<ClientManager>) -> Self {
        Self {
            port,
            client_manager,
        }
    }

    pub async fn start(self) {
        let ws_route = warp::path("ws")
            .and(warp::ws())
            .and(with_clients(self.client_manager.clone()))
            .map(|ws: warp::ws::Ws, client_manager| {
                ws.on_upgrade(move |socket| handle_client(socket, client_manager))
            });

        let cors = warp::cors()
            .allow_any_origin()
            .allow_methods(vec!["GET", "POST"])
            .allow_headers(vec!["content-type"]);

        let routes = ws_route.with(cors);

        info!("WebSocket server starting on port {}", self.port);
        warp::serve(routes).run(([0, 0, 0, 0], self.port)).await;
    }
}

fn with_clients(
    client_manager: Arc<ClientManager>,
) -> impl Filter<Extract = (Arc<ClientManager>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || client_manager.clone())
}

async fn handle_client(ws: WebSocket, client_manager: Arc<ClientManager>) {
    let (mut client_ws_tx, mut client_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();

    let client_id = uuid::Uuid::new_v4().to_string();
    client_manager.add_client(client_id.clone(), tx).await;

    let send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if client_ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    while client_ws_rx.next().await.is_some() {}

    send_task.abort();
    client_manager.remove_client(&client_id).await;
}
