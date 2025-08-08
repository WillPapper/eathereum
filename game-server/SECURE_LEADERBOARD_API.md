# Secure Leaderboard API Documentation

## Overview
The game server now implements a secure, session-based leaderboard system with comprehensive anti-cheat measures. Players must establish sessions and report game events in real-time, with server-side validation and tracking.

## Security Features

### 1. Session-Based Authentication
- Each player must start a session before playing
- Unique session tokens prevent unauthorized score submissions
- Sessions track player activity throughout gameplay

### 2. Server-Side Score Tracking
- Scores are calculated server-side based on reported events
- Client never directly sets their score
- All score calculations are validated

### 3. Anti-Cheat Measures
- **Rate Limiting**: Maximum 5 animals per second
- **Duplicate Detection**: Each animal can only be eaten once
- **Value Validation**: Animal values must be 0-10,000
- **Time-Based Validation**: Score must be reasonable for session duration
- **Suspicious Activity Tracking**: Players accumulating violations are banned

### 4. Event-Based System
- Players report individual game events (eating animals, dying)
- Server validates each event before updating score
- Incremental updates prevent large score jumps

## WebSocket Messages

### Client → Server Messages

#### Start Session (Required First)
```json
{
  "type": "StartSession",
  "player_name": "PlayerName"
}
```
- Must be called before any game actions
- Player name: 1-20 characters
- Returns session token for authentication

#### Report Animal Eaten
```json
{
  "type": "AnimalEaten",
  "animal_id": "unique_animal_id",
  "animal_value": 150.50
}
```
- Must have active session
- Each animal_id must be unique
- Value must be 0-10,000
- Rate limited to prevent spam

#### Report Player Death
```json
{
  "type": "PlayerDied"
}
```
- Finalizes the session score
- Triggers final leaderboard update
- Session ends after this

#### Get Leaderboard
```json
{
  "type": "GetLeaderboard"
}
```
- Can be called anytime
- Returns top 20 players

### Server → Client Messages

#### Session Started
```json
{
  "type": "SessionStarted",
  "session_token": "uuid-string"
}
```
- Confirms session creation
- Token is for client reference only

#### Score Updated
```json
{
  "type": "ScoreUpdated",
  "player_name": "PlayerName",
  "rank": 5,
  "score": 1250.50
}
```
- Sent periodically as score increases
- Not sent for every animal (rate limited)

#### Invalid Action
```json
{
  "type": "InvalidAction",
  "reason": "Duplicate animal"
}
```
- Sent when client violates rules
- Reasons include:
  - "No active session"
  - "Invalid session"
  - "Duplicate animal"
  - "Invalid animal value"
  - "Session terminated due to suspicious activity"

#### Leaderboard
```json
{
  "type": "Leaderboard",
  "entries": [
    {
      "rank": 1,
      "player_name": "TopPlayer",
      "score": 5000.00,
      "animals_eaten": 65
    }
  ]
}
```

## Anti-Cheat Rules

### Validation Checks
1. **Eating Rate**: Max 5 animals per second (0.2s minimum between)
2. **Value Range**: 0 ≤ animal_value ≤ 10,000
3. **Duplicate Prevention**: Same animal_id cannot be eaten twice
4. **Session Duration**: Max average 1000 points per minute
5. **Suspicious Activity Threshold**: 10 violations = ban

### Suspicious Activity Points
- +1 for duplicate animal attempt
- +1 for eating too fast
- +1 for unreasonable animal value
- +1 for score too high for session duration

## Frontend Integration Example

```javascript
class SecureGameClient {
    constructor(wsManager) {
        this.wsManager = wsManager;
        this.sessionStarted = false;
        this.eatenAnimals = new Set();
    }
    
    startGame(playerName) {
        this.wsManager.send({
            type: 'StartSession',
            player_name: playerName
        });
    }
    
    onAnimalEaten(animal) {
        // Prevent duplicate submissions
        if (this.eatenAnimals.has(animal.id)) {
            return;
        }
        
        this.eatenAnimals.add(animal.id);
        
        this.wsManager.send({
            type: 'AnimalEaten',
            animal_id: animal.id,
            animal_value: animal.value
        });
    }
    
    onPlayerDeath() {
        this.wsManager.send({
            type: 'PlayerDied'
        });
        this.sessionStarted = false;
        this.eatenAnimals.clear();
    }
    
    requestLeaderboard() {
        this.wsManager.send({
            type: 'GetLeaderboard'
        });
    }
}
```

## Testing

Two test scripts are provided:

1. **test_leaderboard.js** - Basic functionality test
2. **test_secure_leaderboard.js** - Security and anti-cheat tests

Run tests:
```bash
cd game-server
npm install ws  # If needed
node test_secure_leaderboard.js
```

## Security Best Practices

### For Frontend Developers
1. Never trust client-side score calculations
2. Generate unique IDs for each game object
3. Report events as they happen, not in batches
4. Handle "InvalidAction" messages gracefully
5. Start new session after player death

### For Server Operators
1. Monitor suspicious activity logs
2. Adjust thresholds based on game balance
3. Consider implementing IP-based rate limiting
4. Store ban list in Redis for persistence
5. Regular review of leaderboard for anomalies

## Redis Storage Structure

### Session Management
- **Hash**: `session:{token}` - Temporary session data
- **Set**: `active_sessions` - Currently active session tokens

### Leaderboard
- **Sorted Set**: `leaderboard:scores` - Player scores
- **Hash**: `player:{name}` - Player metadata
- **Set**: `banned_players` - Players banned for cheating

### Metrics
- **Hash**: `metrics:suspicious` - Suspicious activity counts
- **Stream**: `audit:events` - Audit log of suspicious events

## Limitations and Considerations

1. **Network Latency**: High latency may trigger false positives
2. **Session Timeout**: Sessions expire after 1 hour of inactivity
3. **Name Changes**: Players can't change names mid-session
4. **Score Persistence**: Only final scores are persisted
5. **Concurrent Sessions**: One session per connection

## Future Improvements

1. **Replay System**: Store game events for replay validation
2. **Machine Learning**: Detect cheating patterns
3. **Cryptographic Proofs**: Client-side proof of work
4. **Social Verification**: Player reporting system
5. **Tournament Mode**: Stricter validation for competitions