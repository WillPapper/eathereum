# Deployment Guide for Stablecoin Monitor

## Quick Start with Auto-Deploy

1. **Fork this repository** to your GitHub account

2. **Set up Render.com**:
   - Sign up at [render.com](https://render.com)
   - Connect your GitHub account

3. **Deploy using Blueprint**:
   - Click "New +" → "Blueprint"
   - Select your forked repository
   - Render will detect `render.yaml` automatically
   - Click "Apply"

4. **Configure Environment**:
   - Go to your service dashboard
   - Click "Environment"
   - Add `ALCHEMY_RPC_URL` with your Base network API key
   - Save changes

5. **Auto-Deploy is Active** ✅
   - Every push to `main` branch will deploy automatically
   - Monitor deployments in the Render dashboard
   - View logs to see real-time transaction monitoring

## GitHub Integration

### Auto-Deploy Settings
- **Enabled by default** in `render.yaml`
- Triggers on push to `main` branch
- Waits for GitHub Actions to pass (if configured)

### CI/CD Pipeline
The included GitHub Actions workflow:
- Runs on every push to `stablecoin-server/`
- Checks code formatting
- Runs clippy linter
- Builds the Rust binary
- Builds Docker image
- If all checks pass → Render auto-deploys

## Manual Deployment Control

To disable auto-deploy:
1. Edit `render.yaml`
2. Set `autoDeploy: false`
3. Deploy manually from Render dashboard

## Monitoring Deployments

### In Render Dashboard
- **Events**: Shows all deployment triggers
- **Logs**: Real-time output from the worker
- **Metrics**: Memory and CPU usage

### Expected Log Output
```
Starting Stablecoin Monitor Server for Base Network
Monitoring stablecoins:
  - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  - USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
  - DAI:  0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
WebSocket server listening on: 0.0.0.0:8080
Starting blockchain monitoring loop (polling every 2 seconds)
Processing block 12345678
Found USDC transfer: 0x123... -> 0x456... amount: 100.000000
```

## Rollback Strategy

If a deployment fails:
1. Go to Render dashboard
2. Click on your service
3. Go to "Events" tab
4. Find the last successful deploy
5. Click "Rollback to this deploy"

## Deployment Checklist

- [ ] Alchemy API key is set for Base network
- [ ] GitHub repository is connected
- [ ] Auto-deploy is enabled in render.yaml
- [ ] Environment variables are configured
- [ ] WebSocket port (8080) is noted for client connections
- [ ] Logs show successful block processing

## Troubleshooting

### Service Not Starting
- Check `ALCHEMY_RPC_URL` is set correctly
- Verify it's a Base network endpoint, not Ethereum
- Check logs for specific error messages

### No Transactions Found
- Verify you're using Base network RPC
- Check that the addresses are correct for Base
- Monitor logs to see if blocks are being processed

### WebSocket Connection Issues
- Ensure port 8080 is exposed
- Check firewall/security group settings
- Test with `wscat -c ws://your-service.onrender.com`

## Support

For issues, check:
1. Render service logs
2. GitHub Actions workflow status
3. This repository's issues section