# Leaderboard API Documentation

## Overview
The game server now supports a persistent leaderboard system using Redis sorted sets. Players can submit their scores and retrieve the top 20 players.

## WebSocket Messages

### Client → Server Messages

#### Update Score
Submit or update a player's score:
```json
{
  "type": "UpdateScore",
  "player_name": "PlayerName",
  "score": 1250.50,
  "animals_eaten": 15
}
```

#### Get Leaderboard
Request the current top 20 leaderboard:
```json
{
  "type": "GetLeaderboard"
}
```

### Server → Client Messages

#### Transaction (existing)
Blockchain transaction data:
```json
{
  "type": "Transaction",
  "stablecoin": "USDC",
  "amount": "100.00",
  "from": "0x...",
  "to": "0x...",
  "block_number": 12345678,
  "tx_hash": "0x..."
}
```

#### Score Updated
Confirmation when a score is successfully updated:
```json
{
  "type": "ScoreUpdated",
  "player_name": "PlayerName",
  "rank": 5,
  "score": 1250.50
}
```

#### Leaderboard
Current top 20 players:
```json
{
  "type": "Leaderboard",
  "entries": [
    {
      "rank": 1,
      "player_name": "TopPlayer",
      "score": 5000.00,
      "animals_eaten": 65
    },
    {
      "rank": 2,
      "player_name": "SecondBest",
      "score": 4500.00,
      "animals_eaten": 58
    }
    // ... up to 20 entries
  ]
}
```

## Redis Storage Structure

### Sorted Set: `leaderboard:scores`
- Stores player names with their scores
- Automatically sorted by score (highest first)
- Limited to top 100 players (auto-trimmed)

### Hash: `player:{name}`
- Stores additional player data
- Fields:
  - `data`: JSON object with `animals_eaten` and `last_update` timestamp

## Features

1. **Real-time Updates**: Score updates are immediately reflected in the leaderboard
2. **Automatic Broadcasting**: When a player enters the top 20, the updated leaderboard is broadcast to all connected clients
3. **Persistence**: Scores are persisted in Redis and survive server restarts
4. **Efficient Storage**: Only top 100 players are kept to prevent unbounded growth
5. **Player Stats**: Tracks both score and number of animals eaten

## Testing

Use the provided test script to verify functionality:
```bash
cd game-server
npm install ws  # If not already installed
node test_leaderboard.js
```

## Integration with Frontend

The frontend should:
1. Send `UpdateScore` messages periodically or when the player's score changes significantly
2. Request the leaderboard with `GetLeaderboard` when needed (e.g., when opening leaderboard UI)
3. Listen for `Leaderboard` messages to update the display
4. Listen for `ScoreUpdated` messages to show player rank changes

## Example Frontend Code

```javascript
// Send score update
wsManager.send({
  type: 'UpdateScore',
  player_name: playerName,
  score: moneyCollected,
  animals_eaten: animalsEaten
});

// Request leaderboard
wsManager.send({
  type: 'GetLeaderboard'
});

// Handle incoming messages
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'Leaderboard':
      updateLeaderboardDisplay(data.entries);
      break;
    case 'ScoreUpdated':
      showRankNotification(data.rank, data.score);
      break;
    case 'Transaction':
      // Existing transaction handling
      break;
  }
});
```