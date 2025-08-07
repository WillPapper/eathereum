# Block Monitor

A Rust-based blockchain monitor that tracks stablecoin transactions (USDC, USDT, DAI) on Base network and broadcasts them via WebSocket.

## Features

- Polls Alchemy RPC every 2 seconds for new blocks
- Parses ERC-20 transfer and transferFrom transactions
- Broadcasts transaction data via WebSocket to connected clients
- Supports multiple concurrent WebSocket connections
- Health check endpoint for monitoring

## Stablecoins Tracked

**⚠️ IMPORTANT: These are Base Network addresses (Chain ID: 8453), NOT Ethereum mainnet!**

On Base Network:
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` ([View on BaseScan](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913))
- **USDT**: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` ([View on BaseScan](https://basescan.org/token/0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2))
- **DAI**: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` ([View on BaseScan](https://basescan.org/token/0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb))

Source: [Base Official Documentation](https://docs.base.org/)

## Local Development

1. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your Alchemy API key
   ```

2. **Build and Run**
   ```bash
   cargo build --release
   cargo run
   ```

3. **WebSocket Connection**
   - Connect to `ws://localhost:8080`
   - Receive JSON messages with transaction data

## Deployment on Render.com

### As a Background Worker (Recommended)

The server runs as a continuous background worker that polls every 2 seconds:

1. **Fork/Clone Repository**
   - Push code to your GitHub repository

2. **Create Background Worker**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Background Worker"
   - Connect your GitHub repository
   - Use these settings:
     - **Name**: block-monitor
     - **Runtime**: Docker
     - **Docker Context Directory**: `./block-monitor`
     - **Dockerfile Path**: `./Dockerfile`

3. **Set Environment Variables**
   - `ALCHEMY_RPC_URL`: Your Alchemy Base network API URL with key
   - `PORT`: 8080 (WebSocket port)
   - `HEALTH_PORT`: 8081 (Health check port)
   - `RUST_LOG`: info

4. **Deploy**
   - The worker will start automatically and run continuously
   - It polls the blockchain every 2 seconds
   - WebSocket server runs on port 8080 for client connections

### Alternative: Using render.yaml (Recommended)

Deploy directly using the provided configuration with auto-deploy enabled:

```bash
# Push render.yaml to your repo, then in Render:
# 1. New → Blueprint
# 2. Connect your repo
# 3. Render will auto-detect render.yaml
# 4. Auto-deploy is enabled - future pushes to main will deploy automatically
```

**Note**: Auto-deploy is enabled by default in `render.yaml`. Every push to your main branch will trigger a new deployment automatically.

### Monitoring

- Worker logs show block processing and found transactions
- Health endpoint available at port 8081
- WebSocket connections logged in real-time

## WebSocket Message Format

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

## Environment Variables

- `ALCHEMY_RPC_URL`: Alchemy RPC endpoint with API key (required)
- `PORT`: WebSocket server port (default: 8080)
- `HEALTH_PORT`: Health check server port (default: 8081)
- `RUST_LOG`: Log level (default: info)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Alchemy   │────▶│    Server    │────▶│  WebSocket   │
│     RPC     │     │   (Polling)  │     │   Clients    │
└─────────────┘     └──────────────┘     └──────────────┘
      ▲                    │                     │
      │                    ▼                     ▼
  Base Network      Parse ERC-20 TXs      Visualizer
```

## Performance

- Polls every 2 seconds for new blocks
- Processes all transactions in each block
- Minimal memory footprint (~50MB)
- Can handle 100+ concurrent WebSocket connections

## Monitoring

The server logs:
- Block processing progress
- Found stablecoin transfers
- WebSocket connections/disconnections
- Any errors during processing

## License

MIT