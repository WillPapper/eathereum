export const Config = {
    player: {
        startSize: 1.0,
        baseSpeed: 20,
        rotationSpeed: 0.05,
        maxLives: 5,
        startLives: 1
    },
    
    powerUps: {
        life: {
            interval: 120000, // 2 minutes
            glowRadius: 15,
            maxFruits: 5,
            lifetime: 30000, // 30 seconds
            minDistance: 20
        },
        leverage: {
            interval: 90000, // 1.5 minutes
            maxFruits: 2,
            lifetime: 45000, // 45 seconds
            doubleEatWindow: 5000, // 5 seconds
            effectDuration: 15000 // 15 seconds
        },
        speedrun: {
            interval: 75000, // 1.25 minutes
            maxFruits: 2,
            lifetime: 40000, // 40 seconds
            doubleEatWindow: 5000, // 5 seconds
            effectDuration: 12000 // 12 seconds
        }
    },
    
    difficulty: {
        checkInterval: 5000, // 5 seconds
        edibleThreshold: 0.5, // 50% for survival mode
        allianceThreshold: 0.9, // 90% for alliance mode
        modes: {
            normal: 'normal',
            survival: 'survival',
            alliance: 'alliance'
        }
    },
    
    garden: {
        maxPlants: 10000,
        removeBatchSize: 100,
        initialBorderTrees: 50,
        maxBorderTrees: 100,
        massiveTransactionThreshold: 10000, // $10k
        radius: 80
    },
    
    stablecoins: {
        colors: {
            USDC: 0x4A90E2,  // Sky blue
            USDT: 0x50C878,  // Emerald green
            DAI: 0xFFD700    // Golden yellow
        },
        decimals: {
            USDC: 6,
            USDT: 6,
            DAI: 18
        }
    },
    
    animals: {
        minSpeed: 0.5,
        maxSpeed: 2.0,
        safeSpawnRadius: 25,
        maxAnimals: 50,
        sizeGrowthFactor: 1.1,
        
        behavior: {
            survivalFleeMultiplier: 2.0,
            allianceSeekRadius: 30,
            allianceStrengthMultiplier: 1.5,
            pathfindingSteps: 10,
            avoidanceRadius: 5
        }
    },
    
    plants: {
        growthSpeed: {
            min: 0.02,
            max: 0.03
        },
        sizeThresholds: {
            small: 1000,
            medium: 10000,
            large: 50000
        },
        heightScale: {
            multiplier: 5,
            offset: 2,
            min: 2,
            max: 30
        },
        stemWidthScale: {
            multiplier: 0.3,
            offset: 0.1,
            min: 0.1,
            max: 2
        }
    },
    
    rendering: {
        shadowsEnabled: true,
        maxRenderDistance: 1000,
        fogNear: 100,
        fogFar: 500,
        ambientLightColor: 0xffffff,
        ambientLightIntensity: 0.6,
        directionalLightColor: 0xffffff,
        directionalLightIntensity: 0.8
    },
    
    performance: {
        maxParticles: 1000,
        simplifiedGeometryThreshold: 100, // Use simplified geometry when > 100 entities
        updateInterval: 16, // ~60 FPS
        physicsSteps: 1
    },
    
    ui: {
        notificationDuration: 3000,
        scoreUpdateInterval: 100,
        hudOpacity: 0.9,
        fontSize: {
            small: '14px',
            medium: '18px',
            large: '24px',
            huge: '36px'
        }
    },
    
    mobile: {
        joystickSize: 100,
        joystickOpacity: 0.5,
        touchSensitivity: 1.0,
        pinchZoomSpeed: 0.01
    },
    
    camera: {
        fov: 75,
        near: 0.1,
        far: 1000,
        defaultDistance: 20,
        minDistance: 5,
        maxDistance: 50,
        followSpeed: 0.1
    },
    
    environment: {
        groundSize: 200,
        skyColor: 0x87CEEB,
        groundColor: 0x3a5f3a,
        treeColors: [0x228B22, 0x355E3B, 0x2E7D32, 0x1B5E20]
    }
};

// Environment-specific overrides
const getEnvironmentConfig = () => {
    const env = typeof window !== 'undefined' && window.location 
        ? window.location.hostname 
        : 'localhost';
    
    if (env.includes('localhost') || env.includes('127.0.0.1')) {
        // Development overrides
        return {
            performance: {
                ...Config.performance,
                maxParticles: 500,
                simplifiedGeometryThreshold: 50
            },
            garden: {
                ...Config.garden,
                maxPlants: 1000
            }
        };
    }
    
    return {}; // No overrides for production
};

// Apply environment overrides
const envOverrides = getEnvironmentConfig();
Object.keys(envOverrides).forEach(key => {
    Config[key] = { ...Config[key], ...envOverrides[key] };
});

// Freeze config to prevent accidental mutations
export default Object.freeze(Config);