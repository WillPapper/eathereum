# Eathereum 🌳

A PVP game where you consume smaller stablecoin transfers and avoid larger ones to grow before getting eaten.

## Overview

Eathereum is a multiplayer game built on real-time Base network data. Each stablecoin transaction (USDC, USDT, DAI) becomes an animal in the game world. Players control an animal that grows by eating smaller transactions and dies when eaten by larger ones. Size correlates to transaction value.

## Goal

To gamify blockchain data into a competitive experience. Inspired by Bitlisten (which converts Bitcoin transactions to audio), Eathereum converts stablecoin transactions into gameplay entities. Players compete in real-time against actual transaction flows on Base, making DeFi activity tangible through game mechanics.

## Architecture

### System Components

```
┌─────────────────────┐
│   Block Monitor     │
│  (Rust + Alloy)     │
│                     │
│ - Monitors Base     │
│ - Tracks USDC/USDT/ │
│   DAI transfers     │
│ - Publishes to Redis│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Redis Streams    │
│                     │
│ - Message queue     │
│ - Pub/Sub channel   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Game Server      │
│  (Rust + WebSocket) │
│                     │
│ - Consumes Redis    │
│ - Broadcasts to     │
│   clients via WS    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Frontend (Three.js)│
│                     │
│ - 3D visualization  │
│ - Game mechanics    │
│ - Real-time updates │
└─────────────────────┘
```

### Technology Stack

#### Backend Services

**Block Monitor** (`/block-monitor`)
- **Language**: Rust
- **Blockchain Library**: Alloy (lightweight Ethereum client)
- **Purpose**: Monitors Base network for stablecoin transactions
- **Key Features**:
  - Polls blocks every 2 seconds
  - Filters for USDC, USDT, and DAI transfers
  - Publishes to Redis streams for reliable message delivery
  - Runs as a background worker on Render.com

**Game Server** (`/game-server`)
- **Language**: Rust
- **WebSocket Library**: Tokio-Tungstenite
- **Purpose**: Bridge between blockchain data and game clients
- **Key Features**:
  - Consumes from Redis using consumer groups
  - Maintains WebSocket connections with multiple clients
  - Broadcasts transaction data in real-time
  - Auto-reconnection and error handling

#### Frontend (`/frontend`)

**Visualization Engine**
- **Framework**: Three.js for 3D graphics
- **Architecture**: Vanilla JavaScript
- **Key Features**:
  - Procedural terrain generation
  - Transaction-to-entity mapping
  - Size-based collision detection
  - Power-up system
  - Mobile touch controls

**Game Mechanics**
- **Core Loop**: Eat smaller entities, avoid larger ones
- **Entities**: Real stablecoin transactions mapped to animals
  - Size: Log scale of transaction value
  - Color: Stablecoin type (USDC=blue, USDT=green, DAI=gold)
  - Movement: AI pathfinding with collision avoidance
- **Scoring**: Player size = accumulated value
- **Power-ups**: 2x size (leverage), 2x speed (speedrun), extra lives

### Data Flow

1. **Transaction Detection**: Block monitor polls Base network every 2 seconds
2. **Event Processing**: Transfer events are decoded and formatted
3. **Message Queue**: Transactions published to Redis stream
4. **Broadcasting**: Game server consumes and broadcasts via WebSocket
5. **Visualization**: Frontend renders transactions as animated creatures
6. **Interaction**: Players interact with transactions through gameplay

### Deployment

- **Block Monitor**: Deployed as Render.com background worker
- **Game Server**: Deployed as Render.com web service
- **Frontend**: Static site hosting (GitHub Pages/Vercel/Netlify)
- **Redis**: Managed Redis instance (Redis Cloud/Upstash)

### Stablecoin Addresses (Base Network)

- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **USDT**: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- **DAI**: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`

## Features

### Gameplay
- Eat smaller transactions to grow
- Avoid larger transactions to survive
- Collect power-ups for temporary advantages
- Alliance mode: smaller entities team up when threatened

### UI Components
- Live transaction feed with Basescan links
- Market volume counters per stablecoin
- Queue status indicator
- Player stats (size, lives, score)

### Controls
- **Desktop**: WASD movement, QE rotation, mouse camera
- **Mobile**: Omnidirectional touch movement
- **Common**: Click/tap to start, any key to restart

## Design Philosophy

Eathereum maps blockchain data directly to game mechanics:
- **Size = Value**: Transaction amounts determine entity size
- **Real-time data**: Every entity represents an actual Base transaction
- **Simple rules**: Eat smaller, avoid larger
- **Competitive scoring**: Player size reflects accumulated transaction value

The game provides an intuitive interface for understanding DeFi activity through gameplay.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
