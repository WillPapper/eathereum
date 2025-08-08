# Frontend Migration Status

This document tracks the migration from the legacy monolithic code to the new modular architecture.

## Migration Status

### ✅ Completed Modules

The following have been successfully migrated to the new modular architecture:

- **Core Game Loop** → `js/game-loop.js`
- **Configuration** → `js/config.js`
- **Player Controls** → `js/player.js`
- **Game State** → `js/game-state.js`
- **Scene Setup** → `js/scene-manager.js`
- **UI Management** → `js/ui-manager.js`
- **Basic Entity Management** → `js/entity-manager.js`
- **WebSocket Connection** → `js/websocket-manager.js`

### ⚠️ Features Not Yet Migrated

The following features from the legacy code need to be ported to the new architecture:

#### From `websocket.js`:
- [ ] **SpawnQueue System** - Controls entity spawn rate to prevent overwhelming
  - Queue management with configurable delay
  - Size distribution control (smaller/larger ratio)
  - Max queue size limits
  - Queue statistics and monitoring

#### From `visualizer.js`:
- [ ] **Advanced Animal AI** - Complex behavioral patterns
  - Alliance mode (animals teaming up)
  - Survival mode behaviors
  - Predictive chase algorithms
  - Fleeing and hunting patterns
  
- [ ] **Plant Growth System** - Dynamic plant lifecycle
  - Different plant types based on transaction size
  - Growth animations
  - Swaying effects
  - Border tree generation
  
- [ ] **Mobile Controls** - Touch-based input
  - Omnidirectional touch movement
  - Mobile-specific UI adjustments
  - Touch gesture recognition
  
- [ ] **Advanced Power-ups** - Extended power-up system
  - Power-up spawn timing
  - Visual effects (glowing, pulsing)
  - Multiple power-up types active simultaneously
  
- [ ] **Transaction Feed UI** - Live transaction display
  - Queue count display
  - Transaction history
  - Basescan links
  - Volume tracking by stablecoin

- [ ] **Debug Console Commands** - Developer tools
  - `configureSpawnQueue()`
  - `getSpawnQueueStats()`
  - Performance monitoring
  - Entity spawn controls

## Migration Plan

### Phase 1: Core Functionality (Priority)
1. **Port SpawnQueue to `entity-manager.js`**
   - Essential for game balance
   - Prevents performance issues
   - Controls game difficulty

2. **Enhance Animal AI in `entity-manager.js`**
   - Port alliance mode logic
   - Add survival mode behaviors
   - Implement predictive movement

### Phase 2: Visual Enhancements
3. **Improve Plant System**
   - Add growth animations
   - Implement swaying effects
   - Create plant variety based on transaction size

4. **Add Visual Effects**
   - Power-up glowing effects
   - Particle systems
   - Enhanced lighting

### Phase 3: Platform Support
5. **Add Mobile Controls to `player.js`**
   - Touch input handling
   - Responsive UI adjustments
   - Mobile performance optimizations

### Phase 4: Developer Tools
6. **Port Debug Commands**
   - Console utilities
   - Performance monitoring
   - Testing helpers

## File Disposition

### Keep (Temporarily)
- `visualizer.js` - Contains complex logic not yet migrated
- `websocket.js` - Contains SpawnQueue system

### Can Remove (After Migration)
Once all features are migrated and tested:
1. Remove `visualizer.js`
2. Remove `websocket.js`
3. Update README to remove legacy references

## Testing Checklist

Before removing legacy files, ensure:
- [ ] Game spawns entities at controlled rate
- [ ] Animals exhibit proper AI behaviors
- [ ] Plants grow and animate correctly
- [ ] Mobile controls work (if applicable)
- [ ] All power-ups function
- [ ] Transaction feed displays correctly
- [ ] Performance is equal or better than legacy

## Notes

The legacy files contain 6000+ lines of code with many interdependencies. A gradual migration approach is recommended to ensure no functionality is lost. The new modular architecture provides a much cleaner foundation, but some complex features need careful porting to maintain game quality.

The current index.html has been updated to use the new modules, with legacy scripts commented out for reference.