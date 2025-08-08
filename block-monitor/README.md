# Block Monitor

Rust service that monitors Base network for stablecoin transactions and publishes to Redis.

## Architecture

### Components

- **Blockchain Client**: Alloy provider for Base network RPC access
- **Transaction Parser**: Decodes ERC20 Transfer events from logs
- **Redis Publisher**: Streams transactions to Redis
- **WebSocket Server**: Direct client connections (fallback)
- **Health Server**: HTTP endpoint for monitoring
### File Structure

```
block-monitor/
├── src/
│   ├── main.rs              # Application entry point and orchestration
│   ├── lib.rs               # Module declarations
│   ├── config.rs            # Configuration constants and stablecoin addresses
│   ├── transaction.rs       # Transaction data model
│   ├── blockchain.rs        # Blockchain interaction and log processing
│   ├── monitor.rs           # Main monitoring loop and coordination
│   ├── redis_publisher.rs   # Redis stream publishing logic
│   ├── websocket_server.rs  # WebSocket server for real-time updates
│   └── health_server.rs     # Health check endpoint
├── Cargo.toml               # Dependencies
└── render.yaml              # Render.com deployment config
```

### Module Responsibilities

#### `config.rs`
- Defines stablecoin contract addresses for Base network
- Stores configuration constants (polling intervals, limits)
- Provides stablecoin metadata (name, decimals)

#### `transaction.rs`
- Defines the `TransactionData` struct
- Shared data model for transactions across the system

#### `blockchain.rs`
- `BlockchainMonitor` struct handles all blockchain interactions
- Processes blocks and extracts Transfer events
- Formats transaction amounts based on token decimals
- Handles RPC provider errors gracefully

#### `monitor.rs`
- `StablecoinMonitor` orchestrates the monitoring process
- Manages the polling loop and block processing
- Coordinates between blockchain, Redis, and WebSocket components
- Tracks last processed block

#### `redis_publisher.rs`
- `RedisPublisher` handles Redis connections with retry logic
- Publishes transactions to Redis streams
- Manages connection failures gracefully
- Auto-trims stream to prevent unbounded growth

#### `websocket_server.rs`
- `WebSocketServer` manages WebSocket connections
- Broadcasts transactions to all connected clients
- Handles client connections/disconnections
- Supports ping/pong for connection health

#### `health_server.rs`
- `HealthServer` provides HTTP health check endpoint
- Used by container orchestrators and load balancers
- Simple HTTP 200 OK response

#### `main.rs`
- Initializes all components
- Sets up graceful shutdown handling
- Manages concurrent task execution
- Validates configuration on startup

### Data Flow

1. **Blockchain Monitoring**: `BlockchainMonitor` polls Base network every 2 seconds
2. **Event Processing**: Extracts ERC20 Transfer events for configured stablecoins
3. **Orchestration**: `StablecoinMonitor` coordinates processing and distribution
4. **Publishing**: Sends transaction data to:
   - `RedisPublisher` → Redis stream (`stablecoin:transactions`)
   - `WebSocketServer` → Connected clients (real-time broadcast)
5. **Health Monitoring**: `HealthServer` provides HTTP endpoint for service health

## Configuration

### Monitored Stablecoins

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| USDT | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |

### Environment Variables

```bash
RPC_URL=https://mainnet.base.org      # Base RPC endpoint
REDIS_URL=redis://localhost:6379      # Redis connection
PORT=8080                              # WebSocket port
HEALTH_PORT=8081                       # Health check port
```

## Development

### Prerequisites

- Rust 1.75+
- Redis instance
- Base RPC access (Alchemy, Infura, or public)

### Commands

```bash
# Install dependencies
cargo build

# Run with environment variables
export RPC_URL=your_rpc_url
export REDIS_URL=redis://localhost:6379
cargo run

# Run tests
cargo test

# Build release binary
cargo build --release
```

## Deployment

### Render.com Configuration

Deployed as a background worker:

```yaml
services:
  - type: worker
    name: block-monitor
    runtime: rust
    buildCommand: cargo build --release
    startCommand: ./target/release/block-monitor
```

### Resource Requirements

- **Memory**: ~50MB
- **CPU**: Minimal (spike during block processing)
- **Network**: Constant RPC polling

## Output Format

### Redis Stream Entry

```json
{
  "stablecoin": "USDC",
  "amount": "100.000000",
  "from": "0x123...",
  "to": "0x456...",
  "block_number": 12345678,
  "tx_hash": "0xabc..."
}
```

### WebSocket Message

Same JSON format broadcast to all connected clients.

## Error Handling

- **RPC Failures**: Logs error and continues polling
- **Redis Disconnection**: Continues operating with WebSocket only
- **Block Processing Errors**: Skips problematic blocks
- **WebSocket Errors**: Removes disconnected clients

## Monitoring

- Health endpoint: `http://localhost:8081/health`
- Logs: INFO level by default, configurable via `RUST_LOG`
- Metrics: Transaction count, block height, connection status

## Performance

- Processes ~300 transactions per block efficiently
- 2-second polling interval (configurable)
- Redis stream capped at 10,000 entries
- Supports 100+ concurrent WebSocket connections