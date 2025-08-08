# Block Monitor

Rust service that monitors Base network for stablecoin transactions and publishes to Redis.

## Architecture

### Components

- **Blockchain Client**: Alloy provider for Base network RPC access
- **Transaction Parser**: Decodes ERC20 Transfer events from logs
- **Redis Publisher**: Streams transactions to Redis
- **WebSocket Server**: Direct client connections (fallback)
- **Health Server**: HTTP endpoint for monitoring

### Data Flow

1. Poll Base network every 2 seconds
2. Fetch blocks with full transaction details
3. Filter for stablecoin Transfer events
4. Decode transaction data (amount, from, to)
5. Publish to Redis stream `stablecoin:transactions`
6. Broadcast to connected WebSocket clients

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