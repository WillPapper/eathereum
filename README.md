# Eathereum 🌳

A competitive PVP game where you consume smaller stablecoin transfers and avoid larger ones, fighting to grow wealthier before getting eaten in a ruthless world of digital currency.

## Overview

Eathereum is a real-time multiplayer survival game where every stablecoin transaction (USDC, USDT, DAI) on the Base network becomes a living creature. You control an animal in this blockchain ecosystem, consuming smaller transactions to grow your wealth while avoiding larger predators that would devour you. It's eat or be eaten in this competitive world where size equals value and only the strongest survive.

## Goal

To transform blockchain activity into an addictive competitive experience, inspired by visualizers like Bitlisten that make cryptocurrency transactions tangible. While Bitlisten turns Bitcoin transactions into musical notes, Eathereum evolves the concept into a brutal PVP arena where players directly compete with real-time stablecoin flows. Every transaction is an opportunity or a threat, creating a visceral understanding of DeFi activity through survival gameplay.

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
- **PVP Competition**: Every player fights for dominance in the same arena
- **Survival Gameplay**: Consume smaller transactions to grow, avoid larger ones or die
- **Animals**: Each represents a real stablecoin transaction
  - Size = transaction value (bigger = more dangerous)
  - Color = stablecoin type (USDC=blue, USDT=green, DAI=gold)
  - AI-controlled with predatory behavior patterns
- **Growth System**: Your size is your score - eat to grow wealthy or be eaten
- **Power-ups**: Rare fruits grant temporary advantages in the fight for survival

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

### Competitive Gameplay
- **Real-time PVP**: Compete against other players in live matches
- **Survival mechanics**: Eat smaller transactions or be eaten by larger ones
- **Wealth accumulation**: Your size represents your accumulated wealth
- **Leaderboard system**: Track the wealthiest survivors

### Strategic Elements
- **Risk vs Reward**: Chase valuable transactions while avoiding threats
- **Power-up control**: Leverage fruits double your size, speedrun fruits double your speed
- **Alliance dynamics**: Smaller creatures team up against dominant predators
- **Market awareness**: React to real stablecoin flow patterns on Base

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

Eathereum weaponizes blockchain data into competitive gameplay:
- **Size = Power**: Transaction value directly translates to predatory dominance
- **Survival of the Richest**: Only the most strategic players accumulate wealth
- **Real Stakes**: Every creature represents actual money flowing through Base
- **Brutal Simplicity**: Eat or be eaten - no complex rules, just pure competition

By turning DeFi activity into a PVP arena, players viscerally understand market dynamics through the universal language of survival.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
