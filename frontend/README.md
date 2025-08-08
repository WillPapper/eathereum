# Frontend

Three.js-based game client that visualizes stablecoin transactions as a competitive ecosystem.

## Architecture

### Components

- **Three.js Renderer**: 3D graphics engine for game visualization
- **WebSocket Client**: Receives real-time transaction data
- **Game Engine**: Collision detection, physics, scoring
- **UI Layer**: Trading feed, stats, controls

### Core Systems

- **Entity Management**: Maps transactions to game objects
- **Spawn Queue**: Controls entity creation rate and distribution
- **Collision System**: Size-based eating mechanics
- **Alliance System**: AI cooperation when threatened
- **Power-up System**: Temporary advantages (2x size, 2x speed, extra lives)

## Game Mechanics

### Core Loop

1. Player controls an animal in the ecosystem
2. Eat smaller transactions to grow
3. Avoid larger transactions to survive
4. Collect power-ups for advantages
5. Game over when eaten by larger entity

### Size Calculation

```javascript
// Transaction value to entity size
const amount = parseFloat(transaction.amount);
const size = Math.log10(amount + 1) * 0.5 + 0.5;
// Clamped between 0.5 and 4.0
```

### Difficulty Modes

- **Normal**: Standard gameplay
- **Survival**: 50%+ entities are larger than player
- **Alliance**: 90%+ entities are smaller, they team up

## Files

### Core Files

- `index.html` - Game UI and structure
- `styles.css` - Visual styling
- `visualizer.js` - Main game logic
- `websocket.js` - WebSocket connection and spawn queue

### Key Functions

**visualizer.js**
- `createAnimal()` - Spawns transaction entity
- `updatePlayerMovement()` - Handles player input
- `checkCollisions()` - Collision detection
- `handleGameOver()` - Game over flow

**websocket.js**
- `SpawnQueue` - Manages entity spawn rate
- `WebSocketManager` - Handles server connection

## Configuration

### WebSocket Connection

```javascript
// Local development
ws://localhost:8080/ws

// Production
wss://game-server.onrender.com/ws
```

### Game Settings

```javascript
const MAX_ANIMALS = 50;           // Max entities on field
const SPAWN_DELAY = 800;          // ms between spawns
const MAX_PLANTS = 10000;         // Garden decoration limit
```

## Controls

### Desktop

- **WASD** - Movement
- **Q/E** - Rotation
- **Mouse** - Camera control
- **Shift** - Speed boost
- **Click** - Start/restart game

### Mobile

- **Touch drag** - Omnidirectional movement
- **Tap** - Start/restart game

## UI Components

### Trading Feed

- Live transaction ticker
- Transaction amount and type
- Basescan links for verification
- Queue status indicator

### Player Stats

- Money collected (score)
- Lives remaining
- Current size
- Market volume by stablecoin

## Development

### Prerequisites

- Modern browser with WebGL support
- Local game server running (for development)

### Setup

```bash
# No build step required - vanilla JavaScript
# Open index.html in browser or serve locally:
python -m http.server 8000
```

### Testing

Open browser console for debug output:
- WebSocket connection status
- Entity spawn events
- Collision detection logs

## Deployment

Static site hosting on any platform:
- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages

No build process required - deploy files as-is.

## Performance

### Optimization Strategies

- Entity pooling for memory efficiency
- Logarithmic size scaling
- Spawn queue to control creation rate
- LOD system for distant objects
- Frustum culling for off-screen entities

### Target Metrics

- 60 FPS on desktop
- 30 FPS on mobile
- < 100ms input latency
- < 200MB memory usage

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile Safari (iOS 14+)
- Chrome Mobile (Android 10+)