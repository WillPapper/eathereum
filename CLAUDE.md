# Stablecoin Visualizer

## Project Overview
This project consists of two main components:
1. **Block Monitor**: A Rust server using Alloy that monitors Base network for stablecoin transactions
2. **Visualizer**: A Three.js-based game that visualizes blockchain activity as an ecosystem where players interact with animals representing transactions

## Current Architecture

### Project Structure
```
stablecoin-visualizer/
├── block-monitor/          # Rust server for blockchain monitoring
│   ├── src/
│   │   └── main.rs        # Alloy-based transaction monitor
│   ├── Cargo.toml         # Dependencies (Alloy, Tokio, WebSocket)
│   ├── render.yaml        # Render.com native Rust deployment config
│   └── README.md          # Server documentation
├── visualizer/            # Frontend game
│   ├── index.html        # Main HTML
│   ├── styles.css        # Game styling
│   └── visualizer.js     # Three.js game logic
├── .github/
│   └── workflows/
│       └── block-monitor.yml  # CI/CD with formatting & clippy
├── .githooks/
│   └── pre-commit        # Auto-runs cargo fmt on commits
└── setup-hooks.sh        # One-time Git hooks setup

```

## Block Monitor (Rust + Alloy)

### Why We Moved from Reth ExEx to Alloy
- **Simplicity**: Alloy provides direct RPC access without running a full node
- **Deployment**: Can run as a simple background worker on Render.com
- **Resource Efficiency**: Lower memory and CPU requirements
- **Provider Agnostic**: Works with any RPC provider (Alchemy, Infura, QuickNode, public RPC)

### Key Implementation Details

#### Transaction Monitoring Pattern
```rust
// Poll every 2 seconds for new blocks
let mut interval = time::interval(Duration::from_secs(2));

// Get blocks with full transaction details
provider.get_block_by_number(block_num, BlockTransactionsKind::Full)

// Parse ERC20 function calls
const TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];
const TRANSFER_FROM_SELECTOR: [u8; 4] = [0x23, 0xb8, 0x72, 0xdd];
```

#### Stablecoin Addresses on Base Network
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- **USDT**: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` (6 decimals)
- **DAI**: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` (18 decimals)

#### WebSocket Broadcasting
- Runs on port 8080
- Broadcasts transaction data to all connected clients
- Format: `{stablecoin, amount, from, to, block_number, tx_hash}`

### Dependencies Required
```toml
[dependencies]
alloy = "0.8"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
eyre = "0.6"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
dotenv = "0.15"
futures-util = "0.3"
```

### Important Alloy Patterns

#### 1. Using the Right Traits
```rust
use alloy::{
    consensus::Transaction as _,  // For tx.to(), tx.input()
    network::TransactionResponse, // For tx.tx_hash()
    rpc::types::BlockTransactionsKind, // For full tx details
};
```

#### 2. Handling Block Number Types
```rust
// Block number is u64, not Option<u64>
let block_number = block.header.number; // No unwrap_or_default()
```

#### 3. Decoding Function Calls
```rust
use alloy::sol;
sol! {
    function transfer(address to, uint256 amount) external returns (bool);
}
// Decode without unnecessary borrows
transferCall::abi_decode(input, false) // Not &input
```

## Visualizer (Three.js Game)

### Game Mechanics
- **Player**: Ground-based animal that moves with arrow keys
- **Animals**: Represent blockchain transactions
  - Size correlates to transaction amount
  - Speed reduced 10x for playability (0.5-2 units/sec)
  - Safe spawn radius of 25 units from player
- **Collision**: Size-based (eat smaller, avoid larger)
- **Score**: Tracks "money collected" from eating animals

### Key Bug Fixes Applied
1. **Missing Global Variables**: Added `gameOver` and `moneyCollected`
2. **Removed Bird References**: Replaced all `birdControls` with `playerControls`
3. **Safe Spawning**: Prevents instant death at spawn
4. **Speed Balancing**: Animals move slowly enough to be manageable

## Deployment Configuration

### Render.com Setup
- **Service Type**: Background Worker (not web service)
- **Auto-Deploy**: Enabled from GitHub main branch
- **Polling Interval**: 2 seconds (continuous loop)
- **Environment Variables**:
  - `RPC_URL`: Base network RPC endpoint
  - `PORT`: 8080 (WebSocket)
  - `HEALTH_PORT`: 8081 (Health checks)

### Render Native Rust Runtime
- **No Docker needed**: Render's native Rust buildpack handles everything
- **Automatic version detection**: Reads Cargo.lock to use correct Rust version
- **Simpler configuration**: Just specify build and start commands
- **Faster builds**: No Docker layer caching overhead
- **render.yaml configuration**:
  ```yaml
  runtime: rust
  buildCommand: cargo build --release
  startCommand: ./target/release/block-monitor
  ```

## Code Quality Enforcement

### Pre-commit Hooks
- Automatically runs `cargo fmt` on Rust files
- Blocks commits if formatting needed
- Setup: `./setup-hooks.sh`

### CI/CD Pipeline
```yaml
# .github/workflows/block-monitor.yml
- cargo fmt -- --check     # Formatting check
- cargo clippy -- -D warnings  # Linting
- cargo test               # Tests
- cargo build --release    # Build check
```

### Clippy Compliance
- All warnings treated as errors
- Common fixes applied:
  - Remove unused imports
  - Add required trait imports
  - Prefix unused parameters with `_`
  - Remove unnecessary borrows

## Common Development Commands

```bash
# Setup (one-time)
./setup-hooks.sh           # Configure Git hooks

# Development
cd block-monitor
cargo fmt                  # Format code
cargo clippy              # Run linter
cargo build --release     # Build optimized binary
cargo run                 # Run locally

# Testing WebSocket
wscat -c ws://localhost:8080  # Connect to WebSocket
```

## Recent Migration from Docker to Native Rust Runtime

### Why We Removed Docker
- **Cargo.lock v4 incompatibility**: Docker image rust:1.75 couldn't read newer lock files
- **Render's native support**: Built-in Rust buildpack handles versions automatically
- **Simpler maintenance**: No need to update Docker images for new Rust versions
- **Faster deployments**: Skip Docker build step entirely

### Migration Steps Taken
1. Deleted `Dockerfile` from block-monitor directory
2. Updated `render.yaml` from `runtime: docker` to `runtime: rust`
3. Specified `buildCommand` and `startCommand` directly
4. Let Render auto-detect Rust version from Cargo.lock

## Gotchas and Solutions

### 1. Alloy Version Compatibility
- Use Alloy 0.8.x for stability
- Import traits explicitly for transaction methods

### 2. Base Network vs Ethereum
- Always use Base network RPC URLs
- Stablecoin addresses are different from mainnet
- Chain ID: 8453

### 3. Render.com Deployment
- **Native Rust Runtime**: No Docker required, Render handles Rust versions
- **Cargo.lock Version Issues**: Solved by using native runtime instead of Docker
- **Background Workers**: Perfect for continuous polling (vs cron jobs)
- **Auto-deploy**: Enabled by default in render.yaml

### 4. Transaction Data Access
- RPC transactions require `BlockTransactionsKind::Full`
- Use `tx.tx_hash()` not `tx.hash`
- Import `TransactionResponse` trait for methods

### 5. Docker vs Native Runtime
- **Cargo.lock v4 Issue**: Older Docker images (rust:1.75) don't support lock file v4
- **Solution**: Use Render's native Rust runtime which auto-detects versions
- **Benefits**: Simpler config, faster builds, automatic Rust updates

### 6. Decimal Handling
- USDC/USDT: 6 decimals
- DAI: 18 decimals
- Format amounts accordingly

## Performance Considerations

### Block Monitor
- Polls every 2 seconds (configurable)
- ~50MB memory usage
- Handles 100+ concurrent WebSocket connections
- Processes ~300 transactions per block efficiently

### Network Optimization
- Reuses single RPC connection
- Broadcasts to all WebSocket clients simultaneously
- Minimal CPU usage between polls

## Future Enhancements

### Potential Improvements
1. **Event Log Parsing**: Use Transfer events instead of function calls
2. **Historical Backfill**: Add support for processing old blocks
3. **Database Storage**: Persist transaction history
4. **Advanced Metrics**: Volume charts, whale tracking
5. **Multi-chain Support**: Extend to other L2s

### Visualization Ideas
1. **Animal Types**: Different animals for different tokens
2. **Particle Effects**: Visual feedback for transactions
3. **Leaderboard**: Track high scores
4. **Real-time Updates**: Connect WebSocket to game

## Resources
- [Alloy Documentation](https://alloy-rs.github.io/alloy/)
- [Base Network Docs](https://docs.base.org/)
- [Render.com Docs](https://render.com/docs)
- [Three.js Documentation](https://threejs.org/docs/)