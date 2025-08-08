# Frontend

Three.js-based game client that visualizes stablecoin transactions as a competitive ecosystem.

## Architecture

### Components

- **Three.js Renderer**: 3D graphics engine for game visualization
- **WebSocket Client**: Receives real-time transaction data
- **Game Engine**: Collision detection, physics, scoring
- **UI Layer**: Trading feed, stats, controls
### File Structure

```
frontend/
├── index.html              # Main HTML with UI elements
├── styles.css              # Game styling and UI
├── visualizer.js           # Legacy file (DO NOT DELETE - contains features being migrated)
├── websocket.js            # Legacy file (DO NOT DELETE - contains SpawnQueue system)
├── MIGRATION.md            # Tracks migration progress from legacy to modular
└── js/                     # Refactored modular architecture
    ├── main.js             # Application entry point and orchestration
    ├── config.js           # Centralized configuration constants
    ├── player.js           # Player controller and input handling
    ├── game-state.js       # Game state management and scoring
    ├── ui-manager.js       # UI updates and display management
    ├── scene-manager.js    # Three.js scene setup and rendering
    ├── entity-manager.js   # Plants, animals, and power-ups
    ├── websocket-manager.js # WebSocket connection and messages
    └── game-loop.js        # Animation loop and timing
```

### Module Responsibilities

#### `main.js`
- Main application orchestrator
- Initializes all game components
- Coordinates module interactions
- Handles game lifecycle (start, pause, game over)

#### `config.js`
- All game configuration in one place
- Garden boundaries and limits
- Stablecoin colors mapping
- Power-up configurations

#### `player.js`
- `PlayerController` class manages player input
- Keyboard and mouse event handling
- Player movement physics
- Camera following logic

#### `game-state.js`
- `GameState` class tracks game progress
- Score and money collection
- Lives system
- Statistics tracking
- High score persistence

#### `ui-manager.js`
- `UIManager` class handles all UI updates
- Score and stats display
- Screen management (start, pause, game over)
- Power-up indicators

#### `scene-manager.js`
- `SceneManager` class handles Three.js setup
- Scene, camera, and renderer initialization
- Lighting configuration
- Ground and border creation

#### `entity-manager.js`
- `EntityManager` class manages game entities
- Plant creation and growth
- Animal behavior and AI
- Power-up fruit spawning
- Collision detection

#### `websocket-manager.js`
- `WebSocketManager` handles server connection
- Transaction data processing
- Automatic reconnection logic
- Connection status monitoring

#### `game-loop.js`
- `GameLoop` class manages animation
- Frame timing and delta time
- FPS monitoring
- Pause/resume functionality

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

// Production - configured in websocket.js
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