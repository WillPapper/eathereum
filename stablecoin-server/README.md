# Stablecoin Monitor Server

A Rust server that monitors Base network for stablecoin transactions (USDC, USDT, DAI) and broadcasts them via WebSocket.

## Features

- Polls Alchemy RPC every 2 seconds for new blocks
- Parses ERC-20 transfer and transferFrom transactions
- Broadcasts transaction data via WebSocket to connected clients
- Supports multiple concurrent WebSocket connections
- Health check endpoint for monitoring

## Stablecoins Tracked

On Base Network:
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **USDT**: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- **DAI**: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`

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

### As a Cron Job

1. **Fork/Clone Repository**
   - Push code to your GitHub repository

2. **Create Render Service**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Cron Job"
   - Connect your GitHub repository
   - Use these settings:
     - **Name**: stablecoin-monitor
     - **Runtime**: Docker
     - **Schedule**: `*/2 * * * *` (every 2 minutes)
     - **Docker Context Directory**: `./stablecoin-server`
     - **Dockerfile Path**: `./Dockerfile`

3. **Set Environment Variables**
   - `ALCHEMY_RPC_URL`: Your Alchemy API URL with key
   - `PORT`: 8080 (or your preferred port)
   - `RUST_LOG`: info

### As a Web Service

For continuous monitoring (recommended):

1. **Create Web Service**
   - Use `render.yaml` configuration
   - Or create manually with same Docker settings
   - Set as "Web Service" instead of "Cron Job"

2. **Health Checks**
   - Health endpoint: `http://your-service.onrender.com:8081/health`
   - Returns 200 OK when service is running

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