# Code Separation: WebSocket vs Visualization

## Overview

The visualizer code has been split into two independent modules to enable parallel development without merge conflicts:

1. **websocket.js** - Handles all network communication
2. **visualizer.js** - Handles all 3D rendering and game logic

## Architecture

```
┌─────────────────┐         Events          ┌──────────────────┐
│                 │ ◄──────────────────────► │                  │
│  websocket.js   │                          │  visualizer.js   │
│                 │                          │                  │
│  - Connection   │  'transaction' event     │  - 3D Rendering  │
│  - Reconnection │  ────────────────────►   │  - Game Logic    │
│  - Simulation   │                          │  - Animal Spawn  │
│  - Status Mgmt  │  'status:change' event   │  - UI Updates    │
│                 │  ────────────────────►   │                  │
└─────────────────┘                          └──────────────────┘
        ▲                                             │
        │                                             │
        └──────────── wsManager.toggle() ────────────┘
                     wsManager.connect()
                    wsManager.disconnect()
```

## File Responsibilities

### websocket.js
- WebSocket connection management
- Automatic reconnection logic
- Connection status tracking
- Transaction simulation fallback
- Event emission for status changes and new transactions
- No dependencies on Three.js or game logic

### visualizer.js
- Three.js scene management
- Animal creation and movement
- Player controls and physics
- UI rendering and updates
- Game state management
- Listens to events from websocket.js

## Communication Protocol

### Events from websocket.js → visualizer.js

1. **'transaction'** - New transaction data received
   ```javascript
   event.detail = {
       stablecoin: 'USDC',
       amount: '1000.00',
       from: '0x...',
       to: '0x...',
       block_number: 12345678,
       tx_hash: '0x...'
   }
   ```

2. **'status:change'** - Connection status changed
   ```javascript
   event.detail = {
       status: 'connected', // or 'disconnected', 'error', 'simulating'
       oldStatus: 'disconnected'
   }
   ```

3. **'connection:open'** - WebSocket connected
4. **'connection:close'** - WebSocket disconnected
5. **'connection:error'** - Connection error occurred

### API from visualizer.js → websocket.js

```javascript
// Global wsManager instance
wsManager.connect()      // Connect to WebSocket
wsManager.disconnect()   // Disconnect from WebSocket
wsManager.toggle()       // Toggle connection state
wsManager.isConnected()  // Check if connected
wsManager.getStats()     // Get connection statistics
```

## Benefits of Separation

1. **No Merge Conflicts**: Teams can work on networking and visualization independently
2. **Better Testing**: Each module can be tested in isolation
3. **Cleaner Code**: Single responsibility principle - each file has one job
4. **Reusability**: websocket.js can be used with different visualizations
5. **Easier Debugging**: Network issues separated from rendering issues

## Development Workflow

### Working on Network Features
- Edit only `websocket.js`
- Test with mock event listeners
- No need to understand Three.js

### Working on Visualization
- Edit only `visualizer.js`
- Test with simulated events
- No need to understand WebSocket internals

### Adding New Transaction Types
1. Update websocket.js to emit new event type
2. Update visualizer.js to listen for new event
3. No changes needed to existing code

## Example: Adding a New Feature

### Adding transaction filtering in websocket.js:
```javascript
// In websocket.js
if (data.amount > 10000) {
    this.dispatchEvent(new CustomEvent('whale:transaction', { detail: data }));
}
```

### Handling it in visualizer.js:
```javascript
// In visualizer.js
wsManager.addEventListener('whale:transaction', (event) => {
    createSpecialWhaleAnimation(event.detail);
});
```

## Testing

### Test WebSocket independently:
```javascript
// test-websocket.html
wsManager.addEventListener('transaction', (e) => {
    console.log('Transaction:', e.detail);
});
wsManager.connect();
```

### Test Visualizer with mock data:
```javascript
// test-visualizer.html
// Emit fake events without WebSocket
const mockEvent = new CustomEvent('transaction', {
    detail: { stablecoin: 'USDC', amount: '1000' }
});
wsManager.dispatchEvent(mockEvent);
```