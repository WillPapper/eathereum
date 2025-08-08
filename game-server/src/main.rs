use eyre::Result;
use futures_util::{SinkExt, StreamExt};
use redis::aio::MultiplexedConnection;
use redis::streams::{StreamReadOptions, StreamReadReply};
use redis::{AsyncCommands, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};
use warp::ws::{Message, WebSocket};
use warp::Filter;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TransactionData {
    stablecoin: String,
    amount: String,
    from: String,
    to: String,
    block_number: u64,
    tx_hash: String,
}

type Clients = Arc<RwLock<HashMap<String, tokio::sync::mpsc::UnboundedSender<Message>>>>;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    tracing_subscriber::fmt::init();

    info!("Starting Game Server");

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()?;
    let health_port = std::env::var("HEALTH_PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse::<u16>()?;

    let clients: Clients = Arc::new(RwLock::new(HashMap::new()));

    let redis_client = Client::open(redis_url)?;
    let redis_conn = redis_client.get_multiplexed_tokio_connection().await?;

    let redis_conn_clone = redis_conn.clone();
    let clients_clone = clients.clone();
    tokio::spawn(async move {
        if let Err(e) = consume_redis_stream(redis_conn_clone, clients_clone).await {
            error!("Redis stream consumer error: {:?}", e);
        }
    });

    tokio::spawn(start_health_server(health_port));

    let ws_route = warp::path("ws")
        .and(warp::ws())
        .and(with_clients(clients.clone()))
        .map(|ws: warp::ws::Ws, clients| {
            ws.on_upgrade(move |socket| client_connected(socket, clients))
        });

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST"])
        .allow_headers(vec!["content-type"]);

    let routes = ws_route.with(cors);

    info!("WebSocket server starting on port {}", port);
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;

    Ok(())
}

async fn consume_redis_stream(mut conn: MultiplexedConnection, clients: Clients) -> Result<()> {
    let stream_key =
        std::env::var("REDIS_STREAM_KEY").unwrap_or_else(|_| "stablecoin:transactions".to_string());
    let consumer_group =
        std::env::var("CONSUMER_GROUP").unwrap_or_else(|_| "websocket-publisher".to_string());
    let consumer_name = std::env::var("CONSUMER_NAME")
        .unwrap_or_else(|_| format!("consumer-{}", uuid::Uuid::new_v4()));

    let _: Result<(), redis::RedisError> = conn
        .xgroup_create_mkstream(&stream_key, &consumer_group, "$")
        .await
        .or_else(|e| {
            if e.to_string().contains("BUSYGROUP") {
                info!("Consumer group already exists");
                Ok(())
            } else {
                Err(e)
            }
        });

    let last_id = ">".to_string();

    loop {
        let options = StreamReadOptions::default()
            .group(&consumer_group, &consumer_name)
            .count(10)
            .block(1000);

        let result: Result<StreamReadReply, redis::RedisError> = conn
            .xread_options(&[&stream_key], &[&last_id], &options)
            .await;

        match result {
            Ok(reply) => {
                for stream_key_data in reply.keys {
                    for stream_id in stream_key_data.ids {
                        if let Some(data) = parse_stream_data(&stream_id.map) {
                            info!("Broadcasting transaction: {:?}", data);
                            broadcast_to_clients(&clients, &data).await;

                            let _: Result<(), redis::RedisError> = conn
                                .xack(&stream_key, &consumer_group, &[&stream_id.id])
                                .await;
                        }
                    }
                }
            }
            Err(e) => {
                if !e.to_string().contains("timeout") {
                    warn!("Error reading from stream: {:?}", e);
                    sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
}

fn parse_stream_data(data: &HashMap<String, redis::Value>) -> Option<TransactionData> {
    let get_string = |key: &str| -> Option<String> {
        data.get(key).and_then(|v| match v {
            redis::Value::BulkString(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        })
    };

    let get_u64 = |key: &str| -> Option<u64> { get_string(key).and_then(|s| s.parse().ok()) };

    Some(TransactionData {
        stablecoin: get_string("stablecoin")?,
        amount: get_string("amount")?,
        from: get_string("from")?,
        to: get_string("to")?,
        block_number: get_u64("block_number")?,
        tx_hash: get_string("tx_hash")?,
    })
}

async fn broadcast_to_clients(clients: &Clients, data: &TransactionData) {
    let message = match serde_json::to_string(data) {
        Ok(json) => Message::text(json),
        Err(e) => {
            error!("Failed to serialize data: {:?}", e);
            return;
        }
    };

    let clients_guard = clients.read().await;
    let mut disconnected = Vec::new();

    for (id, tx) in clients_guard.iter() {
        if tx.send(message.clone()).is_err() {
            disconnected.push(id.clone());
        }
    }

    drop(clients_guard);

    if !disconnected.is_empty() {
        let mut clients_guard = clients.write().await;
        for id in disconnected {
            clients_guard.remove(&id);
            info!("Client {} disconnected", id);
        }
    }
}

fn with_clients(
    clients: Clients,
) -> impl Filter<Extract = (Clients,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || clients.clone())
}

async fn client_connected(ws: WebSocket, clients: Clients) {
    let (mut client_ws_tx, mut client_ws_rx) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let client_id = uuid::Uuid::new_v4().to_string();
    info!("Client {} connected", client_id);

    clients.write().await.insert(client_id.clone(), tx);

    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if client_ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    while client_ws_rx.next().await.is_some() {}

    clients.write().await.remove(&client_id);
    info!("Client {} disconnected", client_id);
}

async fn start_health_server(port: u16) {
    let health =
        warp::path("health").map(|| warp::reply::with_status("OK", warp::http::StatusCode::OK));

    info!("Health check server starting on port {}", port);
    warp::serve(health).run(([0, 0, 0, 0], port)).await;
}
