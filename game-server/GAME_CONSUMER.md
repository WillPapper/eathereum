# Stablecoin Ecosystem Game Consumer

## Overview
The Game Consumer is an interactive 3D visualization game that connects to the Game Server WebSocket service and transforms real-time blockchain transactions into gameplay elements. Players control an animal in a dynamic ecosystem where other animals represent stablecoin transactions on the Base network.

## Features

### Real-time Blockchain Integration
- **Live Transaction Stream**: Connects to WebSocket service for real-time transaction data
- **Dynamic Animal Spawning**: Each transaction spawns an animal with size based on transaction amount
- **Token Visualization**: Different colors for USDC (blue), USDT (green), and DAI (gold)

### Gameplay Mechanics
- **Size-based Survival**: Eat smaller animals to grow, avoid larger ones
- **Money Collection**: Collect virtual money based on transaction values
- **Score System**: Points based on animals eaten and money collected
- **Safe Spawning**: Animals spawn at safe distance from player

### Visual Features
- **3D Environment**: Three.js powered 3D graphics
- **Dynamic Camera**: Follows player movement
- **Particle Effects**: Visual feedback for interactions
- **Real-time Statistics**: Live transaction counts and volume

## Quick Start

### Prerequisites
1. Redis server running locally or accessible
2. Redis Stream Consumer service running
3. Mock data publisher (optional, for testing)

### Step 1: Start Backend Services
```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Start Redis Stream Consumer
cd redis-stream-consumer
cargo run

# Terminal 3: Start Mock Publisher (for testing)
cd redis-stream-consumer
npm install
npm run mock
```

### Step 2: Launch the Game
```bash
# Open the game in browser
cd redis-stream-consumer
npm run game

# Or open directly
open game-consumer.html
```

## Game Controls

| Key | Action |
|-----|--------|
| **↑/W** | Move Forward |
| **↓/S** | Move Backward |
| **←/A** | Move Left |
| **→/D** | Move Right |
| **Shift** | Sprint (2x speed) |
| **Space** | Jump |
| **P** | Pause/Resume |
| **R** | Restart (when game over) |

## Game Rules

### Eating Mechanics
- You can eat animals that are **20% smaller** than you
- Animals **20% larger** than you will eat you (game over)
- Eating animals increases your size and score

### Scoring System
- **Score**: Based on transaction amounts of eaten animals
- **Money Collected**: Cumulative USD value of consumed transactions
- **Size Multiplier**: Larger size = higher survival chance

### Animal Behavior
- **Size**: Correlates with transaction amount (logarithmic scale)
- **Speed**: Reduced 10x from real values for playability
- **Movement**: Random wandering with boundary bouncing
- **Spawning**: Safe radius prevents instant death

## HUD Elements

### Top Left - Player Stats
- Current score
- Player size multiplier
- Health bar
- Money collected

### Top Right - Blockchain Stats
- Total transactions processed
- Active animals in game
- Token-specific counters (USDC, USDT, DAI)
- Color legend for tokens

### Bottom Left - Controls
- Quick reference for keyboard controls

### Bottom Right - Transaction Feed
- Live feed of recent transactions
- Shows token type and amount
- Color-coded by stablecoin

## Configuration

Edit the `CONFIG` object in `game-consumer.html`:

```javascript
const CONFIG = {
    WS_URL: 'ws://localhost:8080/ws',  // WebSocket endpoint
    MAX_ANIMALS: 50,                   // Maximum concurrent animals
    SPAWN_RADIUS: 50,                  // Spawn distance from center
    SAFE_SPAWN_RADIUS: 25,             // Minimum spawn distance from player
    PLAYER_START_SIZE: 1.0,            // Initial player size
    ANIMAL_SPEED_MULTIPLIER: 0.1,     // Speed reduction for gameplay
    CAMERA_DISTANCE: 30,               // Camera follow distance
    GROUND_SIZE: 200                   // World boundary size
};
```

## Performance Optimization

### Animal Limits
- Maximum 50 animals at once
- Oldest animals removed when limit reached
- Prevents memory overflow

### Transaction Feed
- Shows last 10 transactions only
- Auto-cleanup of old entries
- Smooth animation for new entries

### Rendering
- Shadow mapping for depth
- Fog for distant object fading
- Optimized geometry for spherical animals

## Troubleshooting

### "Connection Refused"
- Ensure Redis Stream Consumer is running on port 8080
- Check WebSocket URL in CONFIG
- Verify no firewall blocking

### "No Animals Spawning"
- Check mock publisher is running
- Verify Redis has data: `redis-cli XLEN stablecoin:transactions`
- Check browser console for errors

### "Laggy Performance"
- Reduce `MAX_ANIMALS` in CONFIG
- Disable shadows in Three.js settings
- Close other browser tabs

### "Game Over Too Quickly"
- Increase `SAFE_SPAWN_RADIUS`
- Reduce `ANIMAL_SPEED_MULTIPLIER`
- Start with mock data for practice

## Development

### Adding New Features
1. **New Animal Types**: Modify `createAnimalFromTransaction()`
2. **Power-ups**: Add collision detection in `updateAnimals()`
3. **Multiplayer**: Extend WebSocket protocol for player data
4. **Leaderboard**: Add backend API for score persistence

### Testing Without Blockchain
Use the mock publisher to generate test transactions:
```bash
# Fast transactions for stress testing
PUBLISH_INTERVAL=500 node mock-redis-publisher.js

# Slow transactions for easier gameplay
PUBLISH_INTERVAL=5000 node mock-redis-publisher.js
```

### Custom Transaction Data
Modify `mock-redis-publisher.js` to send specific transaction patterns:
```javascript
// High-value transactions only
const amount = (Math.random() * 50000 + 50000).toFixed(2);

// Single token type
const token = 'USDC'; // Always USDC
```

## Architecture

```
┌─────────────────┐
│  Base Network   │
│   Blockchain    │
└────────┬────────┘
         │ RPC
┌────────▼────────┐
│  Block Monitor  │
│  (Rust + Alloy) │
└────────┬────────┘
         │ Publish
┌────────▼────────┐
│  Redis Stream   │
│  (Pub/Sub)      │
└────────┬────────┘
         │ Consume
┌────────▼────────┐
│ Redis Consumer  │
│  (WebSocket)    │
└────────┬────────┘
         │ WS
┌────────▼────────┐
│  Game Consumer  │
│  (Three.js)     │
└─────────────────┘
```

## Future Enhancements

### Planned Features
1. **Whale Alerts**: Special effects for large transactions
2. **Token Powers**: Unique abilities per stablecoin type
3. **Seasonal Events**: Time-based challenges
4. **Achievement System**: Unlock rewards for milestones
5. **Social Features**: Share scores, compete with friends

### Blockchain Integration
1. **Wallet Connection**: Link MetaMask for rewards
2. **NFT Rewards**: Mint achievement NFTs
3. **On-chain Scores**: Store high scores on Base
4. **Token Rewards**: Earn tokens for gameplay

## License
MIT - See LICENSE file for details