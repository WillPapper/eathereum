# Spawn Queue System

## Overview
The spawn queue system controls the rate at which animals spawn in the game, preventing instant death from overwhelming spawn rates and maintaining a balanced distribution of animal sizes relative to the player.

## Features

### 1. Controlled Spawn Rate
- **Default Delay**: 800ms between spawns
- **Configurable**: Adjustable from 100ms to 5000ms
- **Smooth Processing**: Uses requestAnimationFrame for smooth spawning

### 2. Size Distribution Management
- **65% Smaller Animals**: Default ratio of animals smaller than the player
- **35% Larger Animals**: Default ratio of animals larger than the player
- **Dynamic Sorting**: Queue automatically reorders to maintain desired distribution

### 3. Queue Management
- **Maximum Size**: 50 transactions (configurable)
- **FIFO with Priority**: Maintains order while prioritizing size distribution
- **Overflow Protection**: Removes oldest items when queue is full

## Implementation

### WebSocket Integration
```javascript
// Transactions are automatically queued when received
wsManager.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    wsManager.spawnQueue.enqueue(data); // Add to queue
    // Spawn event will be emitted when ready
};
```

### Event System
```javascript
// Listen for animals ready to spawn
window.addEventListener('spawn:animal', (event) => {
    const data = event.detail;
    addTransaction(data); // Create the animal
});
```

## Configuration

### JavaScript Console Commands
```javascript
// Adjust spawn delay (milliseconds)
configureSpawnQueue({spawnDelay: 1000});

// Change size distribution (0-1 ratio)
configureSpawnQueue({smallerRatio: 0.7}); // 70% smaller, 30% larger

// Set maximum queue size
configureSpawnQueue({maxQueueSize: 100});

// Get current statistics
getSpawnQueueStats();
```

### Programmatic Control
```javascript
// Get direct access to spawn queue
const queue = wsManager.getSpawnQueue();

// Clear the queue
queue.clear();

// Get detailed statistics
const stats = queue.getStats();
console.log(`Queue: ${stats.queueLength} waiting`);
console.log(`Distribution: ${stats.smallerRatio}`);
```

## Size Calculation

Animal sizes are calculated based on transaction amounts:
```javascript
const amountLog = Math.log10(amount + 1);
const size = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4);
```

Size ranges:
- **Minimum**: 0.5 units
- **Maximum**: 4.0 units
- **Player Default**: 1.0 units

## Testing

A test interface is available at `test_spawn_queue.html` that allows you to:
1. Generate transactions with various amounts
2. Adjust player size to test distribution
3. Configure spawn delay and size ratios
4. Monitor queue statistics in real-time
5. View spawn event logs

## Performance Considerations

1. **Queue Limit**: Maximum 50 items prevents memory issues
2. **Async Processing**: Non-blocking queue processing
3. **RAF Integration**: Smooth spawning using requestAnimationFrame
4. **Efficient Sorting**: Only sorts when distribution needs adjustment

## Benefits

1. **Prevents Instant Death**: Players no longer die immediately from spawn overwhelming
2. **Balanced Gameplay**: Maintains proper ratio of prey vs predator animals
3. **Smooth Experience**: Controlled spawn rate prevents performance issues
4. **Adaptable**: Automatically adjusts to player size changes
5. **Debuggable**: Comprehensive statistics and configuration options

## Visual Indicators

The main game UI shows:
- **Spawn Queue Counter**: Number of animals waiting to spawn
- **Size Distribution**: Percentage of smaller animals in queue
- **Real-time Updates**: Counter updates as queue processes

## Default Settings

```javascript
{
    spawnDelay: 800,        // 800ms between spawns
    maxQueueSize: 50,       // Maximum 50 items in queue
    smallerThanPlayer: 0.65, // 65% smaller animals
    largerThanPlayer: 0.35   // 35% larger animals
}
```

## Troubleshooting

### Animals spawning too fast
```javascript
// Increase spawn delay
configureSpawnQueue({spawnDelay: 1500});
```

### Too many dangerous animals
```javascript
// Increase ratio of smaller animals
configureSpawnQueue({smallerRatio: 0.8});
```

### Queue backing up
```javascript
// Check queue status
console.log(getSpawnQueueStats());
// Decrease spawn delay if needed
configureSpawnQueue({spawnDelay: 500});
```