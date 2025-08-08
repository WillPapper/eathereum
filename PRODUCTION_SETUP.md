# Production Setup - Complete Guide

## Current Status

✅ **Game Server**: Deployed at https://game-server-i4ne.onrender.com
❌ **Block Monitor**: Not deployed yet
❌ **Redis**: Not configured yet

## Why WebSocket Connects But No Data Flows

The game server is running but it's not receiving any blockchain data because:
1. **No Redis instance** is configured (REDIS_URL is not set)
2. **Block monitor is not deployed** to fetch blockchain data
3. Without these, the game server has nothing to broadcast

## Complete Production Setup

### Step 1: Set up Redis

You need a Redis instance. Options:

#### Option A: Redis Cloud (Recommended for production)
1. Sign up at https://redis.com/try-free/
2. Create a free database (30MB free tier)
3. Get your connection string: `redis://default:password@redis-instance.c123.us-east-1-2.ec2.cloud.redislabs.com:12345`

#### Option B: Render Redis
1. In Render dashboard, create a new Redis instance
2. Get the internal connection string

### Step 2: Configure Services with Redis URL

#### For Game Server (already deployed)
1. Go to https://dashboard.render.com
2. Find "game-server-i4ne"
3. Go to Environment → Add environment variable:
   - Key: `REDIS_URL`
   - Value: Your Redis connection string

#### For Block Monitor (needs deployment)
1. Deploy the block-monitor service to Render
2. Set environment variables:
   - `REDIS_URL`: Same Redis connection string
   - `RPC_URL`: Your Base network RPC URL (e.g., from Alchemy, Infura, or QuickNode)

### Step 3: Deploy Block Monitor

```bash
# The block-monitor should auto-deploy when you push to main
# Or manually trigger deployment in Render dashboard
```

### Step 4: Get Base Network RPC URL

You need an RPC endpoint for Base network:

#### Free Options:
- Public RPC: `https://mainnet.base.org` (rate limited)
- Alchemy: https://www.alchemy.com/ (free tier: 300M compute units/month)
- Infura: https://infura.io/ (free tier: 100k requests/day)
- QuickNode: https://www.quicknode.com/ (free trial)

#### Example Alchemy Setup:
1. Sign up at https://www.alchemy.com/
2. Create new app → Choose "Base Mainnet"
3. Copy the HTTPS URL
4. Set as `RPC_URL` in block-monitor environment

## Architecture Diagram

```
┌──────────────┐     RPC      ┌─────────────────┐     Redis      ┌──────────────┐
│              │ ◄──────────── │                 │ ──────────────► │              │
│ Base Network │               │  Block Monitor  │                 │ Redis Cloud  │
│              │               │   (worker)      │                 │              │
└──────────────┘               └─────────────────┘                 └──────────────┘
                                                                           │
                                                                           │ Redis
                                                                           │ Stream
                                                                           ▼
                               ┌─────────────────┐     WebSocket   ┌──────────────┐
                               │                 │ ◄───────────────│              │
                               │   Game Server   │                 │  Visualizer  │
                               │  (web service)  │ ───────────────►│   (browser)  │
                               └─────────────────┘                 └──────────────┘
```

## Testing Production Setup

Once everything is configured:

1. **Check Block Monitor logs** (in Render dashboard):
   ```
   INFO block_monitor: Found USDC transfer: from=0x... to=0x... amount=1000.00
   INFO block_monitor: Publishing to Redis stream
   ```

2. **Check Game Server logs**:
   ```
   INFO game_server: Broadcasting transaction: TransactionData { ... }
   INFO game_server: Broadcasting to 1 clients
   ```

3. **Test WebSocket connection**:
   - Open `visualizer/test-ws-direct.html`
   - Click "Test Production Server"
   - You should see transaction data flowing!

## Environment Variables Summary

### Block Monitor (worker)
- `RPC_URL`: Base network RPC endpoint (required)
- `REDIS_URL`: Redis connection string (required)
- `RUST_LOG`: "info" (optional)

### Game Server (web service)
- `REDIS_URL`: Same Redis connection string (required)
- `REDIS_STREAM_KEY`: "stablecoin:transactions" (default)
- `CONSUMER_GROUP`: "websocket-publisher" (default)
- `PORT`: 8080 (default)

## Quick Checklist

- [ ] Create Redis instance (Redis Cloud or Render Redis)
- [ ] Get Base network RPC URL (Alchemy/Infura/QuickNode)
- [ ] Set REDIS_URL on game-server in Render
- [ ] Deploy block-monitor with RPC_URL and REDIS_URL
- [ ] Verify block-monitor is finding transactions in logs
- [ ] Test WebSocket connection receives data

## Troubleshooting

### "WebSocket connects but no data"
- Check if block-monitor is running
- Check if REDIS_URL is set on both services
- Check block-monitor logs for transactions

### "Block monitor not finding transactions"
- Verify RPC_URL is correct and working
- Check RPC rate limits
- Base network has 2-second blocks, transactions might be sparse

### "Redis connection failed"
- Verify REDIS_URL format
- Check Redis instance is running
- Ensure Redis allows external connections