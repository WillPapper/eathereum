# Game Server

Rust WebSocket server that consumes Redis streams and broadcasts stablecoin transactions to game clients.

## Architecture

### Components

- **Redis Consumer**: Reads from `stablecoin:transactions` stream using consumer groups
- **WebSocket Server**: Maintains persistent connections with game clients
- **Message Broadcaster**: Distributes transactions to all connected clients
- **Health Server**: HTTP endpoint for monitoring
### File Structure

```
game-server/
├── src/
│   ├── main.rs            # Application entry point and task coordination
│   ├── config.rs          # Configuration management from environment
│   ├── transaction.rs     # Transaction data model
│   ├── redis_consumer.rs  # Redis stream consumer with acknowledgments
│   ├── websocket.rs       # WebSocket server and client management
│   └── health.rs          # Health check HTTP endpoint
├── Cargo.toml             # Dependencies
└── render.yaml            # Render.com deployment config
```

### Module Responsibilities

#### `config.rs`
- Loads and validates environment variables
- Provides centralized configuration struct
- Masks sensitive data in logs (Redis credentials)
- Generates unique consumer names

#### `transaction.rs`
- Defines the `TransactionData` struct
- Shared data model matching block-monitor output

#### `redis_consumer.rs`
- `RedisConsumer` manages Redis stream consumption
- Implements consumer group pattern for scalability
- Handles message acknowledgments
- Parses stream data into transaction objects
- Includes connection retry logic with backoff

#### `websocket.rs`
- `ClientManager` tracks connected WebSocket clients
- `WebSocketServer` handles incoming connections
- Broadcasts messages to all clients efficiently
- Manages client lifecycle (connect/disconnect)
- Thread-safe client registry using Arc<RwLock>

#### `health.rs`
- Provides HTTP health check endpoint
- Simple async server on dedicated port
- Returns OK status for monitoring tools

#### `main.rs`
- Initializes all components with dependency injection
- Spawns concurrent tasks (Redis consumer, WebSocket, health)
- Manages graceful shutdown
- Coordinates component lifecycle

### Data Flow

1. **Redis Consumption**: `RedisConsumer` reads from stream using consumer groups
2. **Message Processing**: Parses Redis stream entries into `TransactionData`
3. **Client Management**: `ClientManager` maintains registry of connected clients
4. **Broadcasting**: Sends transaction JSON to all WebSocket clients
5. **Acknowledgment**: Confirms message processing to Redis
6. **Health Monitoring**: Separate HTTP endpoint for service health

## Configuration

### Environment Variables

```bash
REDIS_URL=redis://localhost:6379           # Redis connection
REDIS_STREAM_KEY=stablecoin:transactions   # Stream to consume
CONSUMER_GROUP=websocket-publisher         # Consumer group name  
PORT=8080                                   # WebSocket port
HEALTH_PORT=8081                            # Health check port
```

### Consumer Group Setup

The server automatically creates its consumer group if it doesn't exist. Multiple instances can share the same group for load balancing.

## Input/Output

### Redis Stream Input

Reads entries with this structure:
```json
{
  "stablecoin": "USDC",
  "amount": "1000.000000",
  "from": "0x123...",
  "to": "0x456...",
  "block_number": 12345678,
  "tx_hash": "0xabc..."
}
```

### WebSocket Output  

Broadcasts the same JSON to all connected clients on `ws://localhost:8080/ws`.

## Development

### Prerequisites

- Rust 1.75+
- Redis instance with stream data
- Block monitor running (to populate Redis)

### Commands

```bash
# Install dependencies
cargo build

# Run with environment variables
export REDIS_URL=redis://localhost:6379
cargo run

# Run tests
cargo test

# Build release binary
cargo build --release
```

## Deployment

### Render.com Configuration

Deployed as a web service:

```yaml
services:
  - type: web
    name: game-server
    runtime: rust
    buildCommand: cargo build --release
    startCommand: ./target/release/game-server
```

### Resource Requirements

- **Memory**: ~30MB base + client connections
- **CPU**: Minimal
- **Network**: WebSocket connections

## Error Handling

- **Redis Disconnection**: Attempts reconnection with backoff
- **Client Errors**: Removes client from broadcast list
- **Message Processing Errors**: Logs and continues
- **Consumer Group Errors**: Retries with exponential backoff

## Monitoring

- Health endpoint: `http://localhost:8081/health`
- Logs: INFO level by default
- Metrics: Connected clients, messages processed

## Client Connection

### WebSocket Endpoint

```javascript
const ws = new WebSocket('wss://game-server.onrender.com/ws');

ws.onmessage = (event) => {
  const transaction = JSON.parse(event.data);
  // Process transaction in game
};
```

### Connection Management

- Automatic ping/pong for keepalive
- Graceful disconnection handling
- No authentication required (public data)

## Performance

- Handles 1000+ concurrent WebSocket connections
- Sub-millisecond broadcast latency
- Redis consumer group for horizontal scaling
- Automatic message acknowledgment