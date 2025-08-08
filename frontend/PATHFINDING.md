# Intelligent Animal Pathfinding System

## Overview
Animals now have intelligent pathfinding behaviors that make the game more dynamic and strategic. Prey animals flee from the player when detected, while predator animals chase the player at a catchable speed.

## Key Features

### 1. Detection System
- **Detection Range**: 15 units - Animals become aware of player
- **Flee Range**: 12 units - Prey starts fleeing
- **Chase Range**: 20 units - Predators start chasing
- **Behavior States**: `wandering`, `fleeing`, `chasing`

### 2. Prey Behavior (Smaller Animals)
Animals smaller than the player will:
- **Detect** player at 15 units distance
- **Flee** when player comes within 12 units
- **Zigzag** while fleeing for unpredictability
- **Panic More** when player is closer (1.5x-2x base speed)
- **Continue Fleeing** for 2 seconds after losing sight

### 3. Predator Behavior (Larger Animals)
Animals larger than the player will:
- **Detect** player at 15 units distance
- **Chase** when player is within range (see below)
- **Predict Movement** - aim where player is going
- **Smooth Pursuit** - gradual turning for realistic movement

#### Size-Based Chase Adjustments
Animals that are bigger than you become progressively less aggressive:
- **1-1.5x your size**: Normal chase range (20 units), normal speed
- **1.5x your size**: 50% chase range (10 units), 70% speed
- **2x your size**: 25% chase range (5 units), 50% speed
- **3x your size**: 15% chase range (3 units), 30% speed
- **4x+ your size**: 10% chase range (2 units), 20% speed

This makes huge predators almost passive - they'll only react if you practically walk into them!

### 4. Speed System

#### Base Speeds
- **Player**: 20 units/second (doubled for better gameplay)
- **Small Animals (Rabbits)**: 0.24-0.84 units/second base
- **Medium Animals (Foxes)**: 0.2-0.7 units/second base
- **Large Animals (Deer)**: 0.18-0.63 units/second base
- **Giant Animals (Bears)**: 0.12-0.42 units/second base

#### Fixed Chase/Flee Speeds (NOT affected by player speed boosts)
- **Rabbits**: 
  - Chase: 1.0 units/second (won't really chase)
  - Flee: 1.4x their base speed (moderate boost)
- **Foxes**:
  - Chase: 3.0 units/second (15% of player speed - slow stalking)
  - Flee: 1.3x their base speed
- **Deer**:
  - Chase: 4.0 units/second (20% of player speed - persistent)
  - Flee: 1.25x their base speed
- **Bears**:
  - Chase: 2.5 units/second (12.5% of player speed - very slow menace)
  - Flee: 1.1x their base speed (barely flee)

#### The Thrill of the Chase
- **Predators are MUCH slower** than the player (30-40% speed)
- **Prey only slightly speeds up** when fleeing (10-30% boost)
- **Panic adds minimal speed** (up to 15% when very close)
- This creates tension - you can catch prey with persistence, and escape predators with skill

#### Important: Speed Boost Power
When the player collects speed boost fruits:
- Player speed doubles (10 → 20 units/second)
- **Predator chase speeds remain fixed** (e.g., Bear still chases at 3.0 units/second)
- Speed boosts become powerful escape tools and hunting aids

### 5. Visual Indicators
- **Green Plus (+)**: Edible animal
- **Red X**: Dangerous predator
- **Yellow Exclamation (!)**: Animal is fleeing
- **Red Eyes**: Animal is chasing

## Distance Units Explained

The game uses Three.js world units, where:
- **1 unit** ≈ 1 meter in game scale
- **Player moves** at 10 units/second
- **World size**: 180x180 units (-90 to +90)
- **Safe spawn radius**: 25 units from player

### Detection Ranges (Recommended)
- **Close Combat**: 2-3 units
- **Melee Range**: 5 units
- **Short Range**: 10 units
- **Medium Range**: 15 units (current detection)
- **Long Range**: 20-30 units
- **Vision Limit**: 30 units (indicator visibility)

## Implementation Details

### PathFinding Properties Added to TransactionAnimal
```javascript
// Movement properties
this.baseSpeed = 0.5 + Math.random() * 1.5; // Base wandering speed
this.speed = this.baseSpeed; // Current speed

// Pathfinding properties  
this.detectionRange = 15; // Detection distance
this.fleeRange = 12; // Start fleeing distance
this.chaseRange = 20; // Start chasing distance
this.behaviorState = 'wandering'; // Current behavior
this.lastPlayerSighting = null; // Memory of player position
```

### Key Methods

#### handlePlayerInteraction()
Main pathfinding logic that:
1. Checks distance to player
2. Determines if animal should flee/chase/wander
3. Calculates movement direction
4. Adjusts speed based on behavior
5. Maintains memory of last player sighting

## Tuning Guide

### Making Animals More Aggressive
```javascript
// Increase chase range
animal.chaseRange = 30; // Chase from further away

// Increase predator speed
this.speed = playerSpeed * 0.95; // 95% instead of 85%
```

### Making Animals More Evasive
```javascript
// Increase flee range
animal.fleeRange = 20; // Start fleeing earlier

// Increase flee speed
this.speed = this.baseSpeed * 2.5; // Faster fleeing
```

### Adjusting Detection
```javascript
// Global adjustment
configurePathfinding({
    detectionRange: 20,
    fleeRange: 15,
    chaseRange: 25
});
```

## Testing

Use `test_pathfinding.html` to:
1. Spawn controlled groups of animals
2. Adjust player size dynamically
3. Monitor behavior states in real-time
4. Test different detection ranges
5. Verify chase/flee mechanics

## Strategy Tips for Players

### Escaping Predators
- **Run at angles** - Don't run straight away
- **Use terrain** - Trees block pathfinding
- **Maintain distance** - Stay >20 units away
- **Speed boosts** - Collect speedrun fruits

### Hunting Prey
- **Approach slowly** - Don't trigger flee too early
- **Cut off escape** - Predict where they'll run
- **Corner them** - Use map boundaries
- **Size matters** - Grow bigger to increase flee range

## Performance Considerations

- **Detection checks** only run for animals within render distance
- **Pathfinding** uses simple steering behaviors (no A*)
- **Memory cleanup** - Last sighting cleared after 2 seconds
- **State transitions** are smoothed to prevent jitter

## Future Enhancements

1. **Group Behaviors** - Flocking for prey animals
2. **Obstacle Avoidance** - Smarter navigation around trees
3. **Ambush Behavior** - Predators hiding behind trees
4. **Territorial Zones** - Animals defending areas
5. **Pack Hunting** - Multiple predators coordinating