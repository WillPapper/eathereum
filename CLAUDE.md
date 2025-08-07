# Stablecoin Visualizer - Reth Execution Extension

## Project Overview
This is a Reth Execution Extension (ExEx) that processes blockchain data to track and visualize stablecoin activity on Base network. It's built using the Reth node infrastructure and processes blocks in real-time as well as historical data through backfilling.

## Key Learnings

### Reth Execution Extensions (ExEx)
- ExEx are plugins that receive notifications about chain events (commits, reorgs, reverts)
- They run alongside the main Reth node and can process blockchain data without interfering with consensus
- ExEx receive `ExExNotification` events which contain committed chains with blocks and execution outcomes

### Project Structure
```
stablecoin-visualizer/
├── Cargo.toml          # Dependencies for Reth and Alloy libraries
├── src/
│   └── main.rs        # Main ExEx implementation
└── CLAUDE.md          # This file
```

### Transaction Data Access in Reth

#### Challenge: Transaction Envelopes
- Blocks contain `EthereumTxEnvelope` types, not raw transactions
- These envelopes don't directly implement the `Transaction` trait due to serialization constraints
- Transaction data (to, value, input) requires special handling

#### Current Approach
1. **Iterate through blocks**: Access blocks via `chain.blocks()`
2. **Get transactions**: Use `block.body().transactions()` to get transaction envelopes
3. **Get senders**: Use `block.senders()` to get recovered sender addresses
4. **Extract basic info**: 
   - Transaction hash: `transaction.hash()`
   - Transaction type: `transaction.ty()` (requires `Typed2718` trait)
   - Sender: From the senders array

#### TODO: Full Transaction Data
To get complete transaction data (to, value, input), options include:
1. Access execution outcomes and receipts from the chain
2. Decode the transaction envelope variants manually
3. Use transaction receipts which contain logs for ERC20 events

### Dependencies Required
```toml
# Core Reth dependencies
reth = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0" }
reth-execution-types = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0" }
reth-exex = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0", features = ["serde"] }
reth-node-api = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0" }
reth-node-ethereum = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0" }
reth-primitives-traits = { git = "https://github.com/paradigmxyz/reth", tag = "v1.6.0" }

# Alloy for Ethereum types
alloy-primitives = "1.0"
alloy-eips = "1.0"  # For Typed2718 trait
```

### Backfill Pattern
The ExEx supports historical data processing through backfilling:
```rust
// CLI arguments for backfill range
--backfill-from-block 1000000
--backfill-to-block 1001000
```

The backfill uses `BackfillJobFactory` to create jobs that stream historical blocks.

### Running the ExEx
```bash
# Build
cargo build

# Run with Reth node (example)
cargo run -- node --backfill-from-block 1000000
```

## Next Steps for Stablecoin Tracking

### 1. Identify Stablecoin Contracts on Base Network
- USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDT on Base: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- DAI on Base: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`

### 2. Parse ERC20 Events
- Transfer event signature: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`
- Decode event logs from transaction receipts
- Track transfer amounts, from/to addresses

### 3. Extract Transaction Input Data
- Identify function selectors:
  - `0xa9059cbb` - transfer(address,uint256)
  - `0x23b872dd` - transferFrom(address,address,uint256)
- Decode function parameters

### 4. Metrics to Track
- Transaction volume per stablecoin
- Number of unique addresses
- Transfer patterns
- Mints and burns (if applicable)

## Gotchas and Workarounds

### 1. Transaction Envelope Types
- The transaction envelope in blocks doesn't directly expose to/value/input
- Need to match on envelope variants or use execution outcomes

### 2. Async Closure Issues
- Reth's `install_exex` has specific requirements for async closures
- Workaround: Use `tokio::task::spawn_blocking` with `block_on` pattern

### 3. Build Times
- First build with Reth dependencies takes significant time (5-10 minutes)
- Subsequent builds are faster due to caching

### 4. Memory Usage
- Processing large block ranges requires significant memory
- Consider batching for production use

## Useful Commands
```bash
# Check build
cargo build

# Run tests (when added)
cargo test

# Format code
cargo fmt

# Lint
cargo clippy
```

## Resources
- [Reth Book](https://paradigmxyz.github.io/reth/)
- [Reth ExEx Examples](https://github.com/paradigmxyz/reth-exex-examples)
- [Alloy Documentation](https://alloy-rs.github.io/alloy/)