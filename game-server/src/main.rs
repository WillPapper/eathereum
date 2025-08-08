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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    UpdateScore {
        player_name: String,
        score: f64,
        animals_eaten: u32,
    },
    GetLeaderboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ServerMessage {
    Transaction(TransactionData),
    Leaderboard {
        entries: Vec<LeaderboardEntry>,
    },
    ScoreUpdated {
        player_name: String,
        rank: u32,
        score: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LeaderboardEntry {
    rank: u32,
    player_name: String,
    score: f64,
    animals_eaten: u32,
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

    info!("Configuration:");
    info!(
        "  Redis URL: {}",
        if redis_url.contains("@") {
            let parts: Vec<&str> = redis_url.split('@').collect();
            if parts.len() > 1 {
                format!("redis://***@{}", parts[1])
            } else {
                "redis://***".to_string()
            }
        } else {
            redis_url.clone()
        }
    );
    info!("  Stream Key: stablecoin:transactions");
    info!("  WebSocket Port: {}", port);
    info!("  Health Port: {}", health_port);

    let clients: Clients = Arc::new(RwLock::new(HashMap::new()));

    info!("Connecting to Redis...");
    let redis_client = match Client::open(redis_url.clone()) {
        Ok(client) => {
            info!("Redis client created successfully");
            client
        }
        Err(e) => {
            error!("Failed to create Redis client: {}", e);
            return Err(e.into());
        }
    };

    let redis_conn = match redis_client.get_multiplexed_tokio_connection().await {
        Ok(conn) => {
            info!("✅ Connected to Redis successfully");
            conn
        }
        Err(e) => {
            error!("❌ Failed to connect to Redis: {}", e);
            error!("Make sure REDIS_URL is set correctly and Redis is accessible");
            return Err(e.into());
        }
    };

    let redis_conn_clone = redis_conn.clone();
    let clients_clone = clients.clone();
    tokio::spawn(async move {
        if let Err(e) = consume_redis_stream(redis_conn_clone, clients_clone).await {
            error!("Redis stream consumer error: {:?}", e);
        }
    });

    // Pass Redis connection to WebSocket handler
    let redis_conn_ws = redis_conn.clone();

    tokio::spawn(start_health_server(health_port));

    let ws_route = warp::path("ws")
        .and(warp::ws())
        .and(with_clients(clients.clone()))
        .and(with_redis(redis_conn_ws))
        .map(|ws: warp::ws::Ws, clients, redis_conn| {
            ws.on_upgrade(move |socket| client_connected(socket, clients, redis_conn))
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

    info!("Starting Redis stream consumer:");
    info!("  Stream: {}", stream_key);
    info!("  Consumer Group: {}", consumer_group);
    info!("  Consumer Name: {}", consumer_name);

    let _: Result<(), redis::RedisError> = conn
        .xgroup_create_mkstream(&stream_key, &consumer_group, "$")
        .await
        .or_else(|e| {
            if e.to_string().contains("BUSYGROUP") {
                info!("Consumer group already exists, reusing it");
                Ok(())
            } else {
                error!("Failed to create consumer group: {}", e);
                Err(e)
            }
        });

    info!("Consumer group ready, starting to consume messages...");

    let last_id = ">".to_string();
    let mut total_messages = 0u64;
    let mut last_log_time = std::time::Instant::now();

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
                let message_count = reply.keys.iter().map(|k| k.ids.len()).sum::<usize>();
                if message_count > 0 {
                    info!("📦 Received {} messages from Redis stream", message_count);
                }

                for stream_key_data in reply.keys {
                    for stream_id in stream_key_data.ids {
                        info!("Processing message ID: {}", stream_id.id);

                        // Log raw data for debugging
                        for (key, value) in &stream_id.map {
                            match value {
                                redis::Value::BulkString(bytes) => {
                                    if let Ok(s) = String::from_utf8(bytes.clone()) {
                                        info!("  {}: {}", key, s);
                                    }
                                }
                                _ => info!("  {}: {:?}", key, value),
                            }
                        }

                        if let Some(data) = parse_stream_data(&stream_id.map) {
                            total_messages += 1;
                            info!(
                                "✅ Transaction #{}: {} ${} from {} to {}",
                                total_messages,
                                data.stablecoin,
                                data.amount,
                                &data.from[..10],
                                &data.to[..10]
                            );

                            let client_count = clients.read().await.len();
                            info!("Broadcasting to {} connected clients", client_count);
                            broadcast_to_clients(&clients, &data).await;

                            let _: Result<(), redis::RedisError> = conn
                                .xack(&stream_key, &consumer_group, &[&stream_id.id])
                                .await;
                        } else {
                            warn!("Failed to parse message data from stream");
                        }
                    }
                }

                // Log statistics every 30 seconds
                if last_log_time.elapsed().as_secs() > 30 {
                    info!(
                        "📊 Statistics: {} total messages processed, {} clients connected",
                        total_messages,
                        clients.read().await.len()
                    );
                    last_log_time = std::time::Instant::now();
                }
            }
            Err(e) => {
                if !e.to_string().contains("timeout") {
                    warn!("Error reading from stream: {:?}", e);
                    warn!("Will retry in 1 second...");
                    sleep(Duration::from_secs(1)).await;
                } else {
                    // Log timeout periodically to show we're still alive
                    if last_log_time.elapsed().as_secs() > 60 {
                        info!("⏳ Still waiting for messages... (processed {} total, {} clients connected)",
                            total_messages,
                            clients.read().await.len()
                        );
                        last_log_time = std::time::Instant::now();
                    }
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
        block_number: get_u64("block")?, // Block-monitor sends "block", not "block_number"
        tx_hash: get_string("tx_hash")?,
    })
}

async fn broadcast_to_clients(clients: &Clients, data: &TransactionData) {
    let server_msg = ServerMessage::Transaction(data.clone());
    let message = match serde_json::to_string(&server_msg) {
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

fn with_redis(
    conn: MultiplexedConnection,
) -> impl Filter<Extract = (MultiplexedConnection,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || conn.clone())
}

async fn client_connected(ws: WebSocket, clients: Clients, mut redis_conn: MultiplexedConnection) {
    let (mut client_ws_tx, mut client_ws_rx) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let client_id = uuid::Uuid::new_v4().to_string();

    let client_count = {
        let mut clients_guard = clients.write().await;
        clients_guard.insert(client_id.clone(), tx.clone());
        clients_guard.len()
    };

    info!(
        "🔌 Client {} connected (total clients: {})",
        client_id, client_count
    );

    // Spawn task to send messages to client
    let client_id_send = client_id.clone();
    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if client_ws_tx.send(message).await.is_err() {
                info!("Client {} websocket send error", client_id_send);
                break;
            }
        }
    });

    // Handle incoming messages from client
    let clients_clone = clients.clone();
    while let Some(result) = client_ws_rx.next().await {
        if let Ok(msg) = result {
            if let Ok(text) = msg.to_str() {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(text) {
                    handle_client_message(client_msg, &mut redis_conn, &clients_clone).await;
                }
            }
        }
    }

    let client_count = {
        let mut clients_guard = clients.write().await;
        clients_guard.remove(&client_id);
        clients_guard.len()
    };
    info!(
        "🔌 Client {} disconnected (remaining clients: {})",
        client_id, client_count
    );
}

async fn handle_client_message(
    msg: ClientMessage,
    redis_conn: &mut MultiplexedConnection,
    clients: &Clients,
) {
    match msg {
        ClientMessage::UpdateScore {
            player_name,
            score,
            animals_eaten,
        } => {
            info!(
                "📊 Score update: {} - score: {}, animals: {}",
                player_name, score, animals_eaten
            );
            
            // Update leaderboard in Redis
            if let Err(e) = update_leaderboard(redis_conn, &player_name, score, animals_eaten).await {
                error!("Failed to update leaderboard: {:?}", e);
                return;
            }
            
            // Get current rank
            if let Ok(rank) = get_player_rank(redis_conn, &player_name).await {
                // Broadcast score update to all clients
                let update_msg = ServerMessage::ScoreUpdated {
                    player_name: player_name.clone(),
                    rank,
                    score,
                };
                
                broadcast_message(clients, &update_msg).await;
                
                // If player is in top 20, broadcast updated leaderboard
                if rank <= 20 {
                    if let Ok(leaderboard) = get_leaderboard(redis_conn).await {
                        let leaderboard_msg = ServerMessage::Leaderboard {
                            entries: leaderboard,
                        };
                        broadcast_message(clients, &leaderboard_msg).await;
                    }
                }
            }
        }
        ClientMessage::GetLeaderboard => {
            info!("📋 Leaderboard requested");
            
            if let Ok(leaderboard) = get_leaderboard(redis_conn).await {
                let leaderboard_msg = ServerMessage::Leaderboard {
                    entries: leaderboard,
                };
                broadcast_message(clients, &leaderboard_msg).await;
            }
        }
    }
}

async fn update_leaderboard(
    conn: &mut MultiplexedConnection,
    player_name: &str,
    score: f64,
    animals_eaten: u32,
) -> Result<()> {
    // Store score in sorted set
    let _: () = conn
        .zadd("leaderboard:scores", player_name, score)
        .await?;
    
    // Store additional player data
    let player_data = serde_json::json!({
        "animals_eaten": animals_eaten,
        "last_update": chrono::Utc::now().to_rfc3339(),
    });
    
    let _: () = conn
        .hset(
            format!("player:{}", player_name),
            "data",
            player_data.to_string(),
        )
        .await?;
    
    // Trim leaderboard to top 100 players (keep more than 20 for context)
    let count: usize = conn.zcard("leaderboard:scores").await?;
    if count > 100 {
        let _: () = conn
            .zremrangebyrank("leaderboard:scores", 0, -(101 as isize))
            .await?;
    }
    
    Ok(())
}

async fn get_leaderboard(conn: &mut MultiplexedConnection) -> Result<Vec<LeaderboardEntry>> {
    // Get top 20 scores
    let scores: Vec<(String, f64)> = conn
        .zrevrange_withscores("leaderboard:scores", 0, 19)
        .await?;
    
    let mut entries = Vec::new();
    
    for (rank, (player_name, score)) in scores.iter().enumerate() {
        // Get additional player data
        let player_data: Option<String> = conn
            .hget(format!("player:{}", player_name), "data")
            .await
            .ok();
        
        let animals_eaten = if let Some(data) = player_data {
            serde_json::from_str::<serde_json::Value>(&data)
                .ok()
                .and_then(|v| v["animals_eaten"].as_u64())
                .unwrap_or(0) as u32
        } else {
            0
        };
        
        entries.push(LeaderboardEntry {
            rank: (rank + 1) as u32,
            player_name: player_name.clone(),
            score: *score,
            animals_eaten,
        });
    }
    
    Ok(entries)
}

async fn get_player_rank(conn: &mut MultiplexedConnection, player_name: &str) -> Result<u32> {
    let rank: Option<usize> = conn.zrevrank("leaderboard:scores", player_name).await?;
    Ok(rank.map(|r| (r + 1) as u32).unwrap_or(0))
}

async fn broadcast_message(clients: &Clients, msg: &ServerMessage) {
    let message = match serde_json::to_string(msg) {
        Ok(json) => Message::text(json),
        Err(e) => {
            error!("Failed to serialize message: {:?}", e);
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
            info!("Client {} disconnected during broadcast", id);
        }
    }
}

async fn start_health_server(port: u16) {
    let health =
        warp::path("health").map(|| warp::reply::with_status("OK", warp::http::StatusCode::OK));

    info!("Health check server starting on port {}", port);
    warp::serve(health).run(([0, 0, 0, 0], port)).await;
}
