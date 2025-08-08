// Configuration constants for Stablecoin Visualizer
// Extracted from visualizer.js - preserving exact values

// Power-up fruit system constants
export const POWER_UP_INTERVAL = 120000; // 2 minutes in milliseconds
export const POWER_UP_GLOW_RADIUS = 15; // Distance at which fruits start glowing
export const MAX_POWER_UP_FRUITS = 5; // Maximum life fruits at any time
export const POWER_UP_LIFETIME = 30000; // 30 seconds in milliseconds
export const MIN_POWER_UP_DISTANCE = 20; // Minimum distance between life fruits

// Leverage fruit system constants
export const LEVERAGE_FRUIT_INTERVAL = 90000; // 1.5 minutes in milliseconds
export const MAX_LEVERAGE_FRUITS = 2; // Maximum leverage fruits at any time
export const LEVERAGE_FRUIT_LIFETIME = 45000; // 45 seconds in milliseconds
export const LEVERAGE_DOUBLE_EAT_WINDOW = 5000; // 5 seconds to double eat for 4x effect
export const LEVERAGE_EFFECT_DURATION = 15000; // 15 seconds of size effect

// Speedrun fruit system constants
export const SPEEDRUN_FRUIT_INTERVAL = 75000; // 1.25 minutes in milliseconds
export const MAX_SPEEDRUN_FRUITS = 2; // Maximum speedrun fruits at any time
export const SPEEDRUN_FRUIT_LIFETIME = 40000; // 40 seconds in milliseconds
export const SPEEDRUN_DOUBLE_EAT_WINDOW = 5000; // 5 seconds to double eat for 4x effect
export const SPEEDRUN_EFFECT_DURATION = 12000; // 12 seconds of speed effect

// Difficulty scaling system constants
export const DIFFICULTY_CHECK_INTERVAL = 5000; // Check every 5 seconds
export const EDIBLE_THRESHOLD = 0.5; // 50% of animals must be edible to trigger survival mode
export const ALLIANCE_THRESHOLD = 0.9; // 90% of animals must be smaller to trigger alliance mode

// Garden configuration
export const MAX_PLANTS = 10000; // Maximum number of plants in the garden
export const REMOVE_BATCH_SIZE = 100; // Number of oldest plants to remove when cap is reached
export const INITIAL_BORDER_TREES = 50; // Initial trees on the border
export const MAX_BORDER_TREES = 100; // Maximum border trees
export const MASSIVE_TRANSACTION_THRESHOLD = 10000; // $10k threshold for new trees
export const GARDEN_RADIUS = 80; // Radius for border tree placement

// Stablecoin colors - nature-inspired, vibrant colors
export const STABLECOIN_COLORS = {
    USDC: 0x4A90E2,  // Sky blue - like morning sky
    USDT: 0x50C878,  // Emerald green - like fresh leaves
    DAI: 0xFFD700   // Golden yellow - like sunflowers
};