# Testing Real Blockchain Data Connection

## Quick Start

To test the visualizer with real blockchain data:

### 1. Start the Block Monitor
```bash
cd block-monitor
cargo run
```
This will:
- Connect to Base network via RPC
- Monitor USDC, USDT, and DAI transfers
- Publish to Redis stream `stablecoin:transactions`

### 2. Start the Game Server
```bash
cd game-server
cargo run
```
This will:
- Connect to Redis
- Consume from `stablecoin:transactions` stream
- Broadcast via WebSocket on `ws://localhost:8080/ws`

### 3. Open the Visualizer
```bash
cd visualizer
# Use any local server, e.g.:
python3 -m http.server 3000
# or
npx http-server -p 3000
```

Then:
1. Open http://localhost:3000 in your browser
2. Click the "Connect" button in the top-left
3. Status should change from "Disconnected" to "Connected"
4. Real blockchain transactions will appear as animals in the game!

## Connection Flow

```
Base Network → Block Monitor → Redis Stream → Game Server → WebSocket → Visualizer
```

## Troubleshooting

### If animals don't appear:
1. Check block-monitor logs for "Found USDC/USDT/DAI transfer" messages
2. Check game-server logs for "Broadcasting to N clients" messages
3. Open browser console (F12) and look for WebSocket connection messages
4. Verify Redis is running: `redis-cli ping` should return `PONG`

### If connection fails:
- The visualizer will automatically fall back to simulated data
- Check that game-server is running on port 8080
- Check browser console for WebSocket errors

## What You'll See

- **Real transactions** appear as animals sized by amount:
  - Small animals: $1-1,000 transactions
  - Medium animals: $1,000-10,000 transactions  
  - Large animals: $10,000-50,000 transactions
  - Huge animals: $50,000+ whale transactions

- **Stablecoin colors**:
  - USDC: Sky blue
  - USDT: Emerald green
  - DAI: Golden yellow

- **Transaction frequency**: Base network typically has 1-5 stablecoin transfers per block (every 2 seconds)

## Production Deployment

The visualizer is already configured to connect to the production game server:

- **Game Server**: https://game-server-i4ne.onrender.com
- **WebSocket Endpoint**: wss://game-server-i4ne.onrender.com/ws

The websocket.js automatically uses:
- **Local development**: ws://localhost:8080/ws
- **Production**: wss://game-server-i4ne.onrender.com/ws

## Testing the Production Connection

1. Open `test-connection.html` in your browser
2. Click "Connect to Production" to test the live connection
3. You should see real blockchain transactions appearing in the log

Or test directly:
```javascript
// In browser console
wsManager.connect(); // Connects to production if not on localhost
```