# Stablecoin Visualizer 🌳

A real-time, interactive 3D visualization of stablecoin transactions on the Base network, presented as a living ecosystem where transactions become creatures in a vibrant garden.

## Overview

The Stablecoin Visualizer transforms blockchain data into an intuitive, gamified experience. Every stablecoin transaction (USDC, USDT, DAI) on Base becomes an animal in a 3D garden, with size representing transaction value. Players can explore this ecosystem, interact with the transactions, and experience the flow of digital currency through gameplay.

## Goal

To make blockchain activity accessible and engaging by visualizing real-time stablecoin transactions in an intuitive way, inspired by the early Bitcoin visualizers from the 2010s that helped people understand cryptocurrency through visual metaphors. 

Where those early visualizers showed Bitcoin as abstract blocks or nodes, we've evolved the concept into a living, breathing ecosystem that anyone can understand: bigger transactions are bigger animals, and the constant flow of stablecoins creates a dynamic garden that reflects real economic activity on Base.

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
- **Architecture**: Vanilla JavaScript for performance
- **Key Features**:
  - Procedurally generated garden environment
  - Real-time transaction visualization as animals
  - Size-based gameplay (eat smaller, avoid larger)
  - Power-up system with special fruits
  - Mobile-optimized touch controls

**Game Mechanics**
- **Player**: A creature that grows by consuming smaller transactions
- **Animals**: Each represents a real stablecoin transaction
  - Size correlates to transaction amount (logarithmic scale)
  - Color indicates stablecoin type (USDC=blue, USDT=green, DAI=gold)
  - Movement patterns create natural ecosystem behavior
- **Environment**: Dynamic garden that grows with large transactions
- **Power-ups**: Special fruits that grant temporary abilities

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

### Real-time Visualization
- Live stablecoin transactions appear as creatures
- Transaction amount determines creature size
- Smooth animations and physics simulation

### Interactive Gameplay
- Control a player creature in the ecosystem
- Grow by consuming smaller transactions
- Avoid larger predators
- Collect power-ups for special abilities

### Trading Feed UI
- Live transaction ticker showing incoming transfers
- Market volume tracking by stablecoin type
- Queue system for spawn management
- Links to Basescan for transaction verification

### Mobile Support
- Omnidirectional touch controls
- Responsive UI scaling
- Optimized performance for mobile devices

## Design Philosophy

The visualizer embraces natural metaphors to make blockchain data intuitive:
- **Size = Value**: Larger transactions are bigger animals
- **Movement = Activity**: Constant motion reflects market dynamics
- **Ecosystem = Economy**: The garden represents the Base network
- **Interaction = Understanding**: Playing helps users grasp transaction flow

By gamifying blockchain data, we transform abstract financial activity into something tangible and engaging, making DeFi accessible to everyone.

## Inspiration

This project draws inspiration from the pioneering Bitcoin visualizers of the early 2010s, such as:
- Bitcoin.com's transaction visualizer
- Blockchain.info's globe visualization
- BitBonkers' 3D block visualization

We've evolved these concepts for the modern DeFi era, focusing on stablecoins as the backbone of everyday blockchain transactions, and adding interactivity to create a more engaging educational experience.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
