// Configuration constants
export const CONFIG = {
    // Garden boundaries
    GARDEN_RADIUS: 80,
    
    // Plant limits
    MAX_PLANTS: 10000,
    REMOVE_BATCH_SIZE: 100,
    INITIAL_BORDER_TREES: 50,
    MAX_BORDER_TREES: 100,
    MASSIVE_TRANSACTION_THRESHOLD: 10000,
    
    // Stablecoin colors
    STABLECOIN_COLORS: {
        USDC: 0x4A90E2,  // Sky blue
        USDT: 0x50C878,  // Emerald green
        DAI: 0xFFD700    // Golden yellow
    },
    
    // Power-up fruits
    POWER_UP: {
        INTERVAL: 120000,     // 2 minutes
        GLOW_RADIUS: 15,
        MAX_FRUITS: 5,
        LIFETIME: 30000,      // 30 seconds
        MIN_DISTANCE: 20
    },
    
    // Leverage fruits
    LEVERAGE: {
        INTERVAL: 90000,      // 1.5 minutes
        MAX_FRUITS: 2,
        LIFETIME: 45000,      // 45 seconds
        DOUBLE_EAT_WINDOW: 5000, // 5 seconds
        EFFECT_DURATION: 15000   // 15 seconds
    },
    
    // Speedrun fruits
    SPEEDRUN: {
        INTERVAL: 75000,      // 1.25 minutes
        MAX_FRUITS: 2,
        LIFETIME: 40000,      // 40 seconds
        DOUBLE_EAT_WINDOW: 5000, // 5 seconds
        EFFECT_DURATION: 12000   // 12 seconds
    },
    
    // Difficulty
    DIFFICULTY: {
        CHECK_INTERVAL: 5000,
        EDIBLE_THRESHOLD: 0.5,
        ALLIANCE_THRESHOLD: 0.9
    },
    
    // Player
    PLAYER: {
        BASE_SPEED: 20,
        ROTATION_SPEED: 0.05,
        INITIAL_SIZE: 1.0,
        MAX_LIVES: 5
    }
};