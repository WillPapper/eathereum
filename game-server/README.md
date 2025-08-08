# Game Server

Rust WebSocket server that consumes Redis streams and broadcasts stablecoin transactions to game clients.

## Architecture

### Components

- **Redis Consumer**: Reads from `stablecoin:transactions` stream using consumer groups
- **WebSocket Server**: Maintains persistent connections with game clients
- **Message Broadcaster**: Distributes transactions to all connected clients
- **Health Server**: HTTP endpoint for monitoring

### Data Flow

1. Connect to Redis stream as consumer
2. Read transactions from consumer group (batch of 10)
3. Acknowledge messages after processing
4. Broadcast JSON to all WebSocket clients
5. Handle client connections/disconnections gracefully

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