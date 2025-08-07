# Game Server

A Rust game server that consumes stablecoin transaction data from Redis streams and broadcasts it to connected game clients via WebSocket.

## Architecture

This service acts as a bridge between:
- **Input**: Redis stream containing blockchain transaction data
- **Output**: WebSocket connections for real-time client updates

## Features

- Connects to Redis and consumes from streams using consumer groups
- Automatic acknowledgment of processed messages
- WebSocket server for broadcasting to multiple clients
- Health check endpoint for monitoring
- Automatic reconnection on failures
- CORS support for web clients

## Environment Variables

- `REDIS_URL`: Redis connection URL (default: `redis://127.0.0.1/`)
- `REDIS_STREAM_KEY`: Stream key to consume from (default: `stablecoin:transactions`)
- `CONSUMER_GROUP`: Redis consumer group name (default: `websocket-publisher`)
- `CONSUMER_NAME`: Unique consumer instance name (auto-generated if not set)
- `PORT`: WebSocket server port (default: `8080`)
- `HEALTH_PORT`: Health check server port (default: `8081`)

## Endpoints

- `ws://localhost:8080/ws`: WebSocket endpoint for receiving transaction updates
- `http://localhost:8081/health`: Health check endpoint

## Data Format

The service broadcasts transaction data in this JSON format:
```json
{
  "stablecoin": "USDC",
  "amount": "1000.50",
  "from": "0x123...",
  "to": "0x456...",
  "block_number": 12345678,
  "tx_hash": "0xabc..."
}
```

## Local Development

```bash
# Install dependencies
cargo build

# Run with environment variables
REDIS_URL=redis://localhost:6379 cargo run

# Run with .env file
cargo run
```

## Testing WebSocket Connection

```bash
# Using wscat
wscat -c ws://localhost:8080/ws

# Using curl for health check
curl http://localhost:8081/health
```

## Deployment

Deployed as a web service on Render.com with automatic deploys from the main branch.

## Redis Stream Details

The service uses Redis consumer groups for reliable message processing:
- Creates consumer group if it doesn't exist
- Acknowledges messages after successful broadcast
- Handles connection failures with automatic retry
- Processes messages in batches of 10

## Client Integration

JavaScript example:
```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onmessage = (event) => {
  const transaction = JSON.parse(event.data);
  console.log('New transaction:', transaction);
};
```