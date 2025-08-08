// Three.js scene setup
let scene, camera, renderer;
let particles = [];
let isPaused = false;
// WebSocket handled by websocket.js
let gameOver = false;
let moneyCollected = 0;

// Player controls (ground-based animal)
let playerControls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    rotateLeft: false,  // Q key rotation
    rotateRight: false, // E key rotation
    boost: false,
    velocity: new THREE.Vector3(),
    rotation: 0,
    rotationSpeed: 0.05, // How fast the player rotates
    mouseX: 0,
    mouseY: 0,
    isPlaying: false,
    size: 1.0,  // Player's current size
    mesh: null,  // Player's 3D model
    speed: 20   // Base movement speed - doubled for better gameplay
};

// Game state
let gameState = {
    isGameOver: false,
    highScore: 0,
    currentScore: 0,
    startTime: null,
    endTime: null,
    lives: 1, // Player starts with 1 life
    maxLives: 5 // Maximum lives player can have
};

// Power-up fruit system
let powerUpFruits = []; // Special glowing fruits that give lives
let lastPowerUpTime = 0;
const POWER_UP_INTERVAL = 120000; // 2 minutes in milliseconds
const POWER_UP_GLOW_RADIUS = 15; // Distance at which fruits start glowing
const MAX_POWER_UP_FRUITS = 5; // Maximum life fruits at any time
const POWER_UP_LIFETIME = 30000; // 30 seconds in milliseconds
const MIN_POWER_UP_DISTANCE = 20; // Minimum distance between life fruits

// Leverage fruit system
let leverageFruits = []; // Special fruits that double player size
let lastLeverageFruitTime = 0;
let lastLeverageFruitEaten = 0; // Track when last leverage fruit was eaten
let leverageEaten = 0; // Count of leverage fruits eaten in double-eat window
let naturalPlayerSize = 1.0; // Track player's natural size without leverage effects
let currentLeverageMultiplier = 1.0; // Current leverage multiplier (1.0 = no effect)
let leverageActive = false; // Whether leverage effect is active
let leverageEffectTimer = null; // Timer to reset player size
const LEVERAGE_FRUIT_INTERVAL = 90000; // 1.5 minutes in milliseconds
const MAX_LEVERAGE_FRUITS = 2; // Maximum leverage fruits at any time
const LEVERAGE_FRUIT_LIFETIME = 45000; // 45 seconds in milliseconds
const LEVERAGE_DOUBLE_EAT_WINDOW = 5000; // 5 seconds to double eat for 4x effect
const LEVERAGE_EFFECT_DURATION = 15000; // 15 seconds of size effect

// Speedrun fruit system
let speedrunFruits = []; // Special fruits that double player speed
let lastSpeedrunFruitTime = 0;
let lastSpeedrunFruitEaten = 0; // Track when last speedrun fruit was eaten
let speedrunEaten = 0; // Count of speedrun fruits eaten in double-eat window
let originalPlayerSpeed = 10; // Store original player speed for resetting
let speedrunActive = false; // Whether speedrun effect is active
let speedrunEffectTimer = null; // Timer to reset player speed
const SPEEDRUN_FRUIT_INTERVAL = 75000; // 1.25 minutes in milliseconds
const MAX_SPEEDRUN_FRUITS = 2; // Maximum speedrun fruits at any time
const SPEEDRUN_FRUIT_LIFETIME = 40000; // 40 seconds in milliseconds
const SPEEDRUN_DOUBLE_EAT_WINDOW = 5000; // 5 seconds to double eat for 4x effect
const SPEEDRUN_EFFECT_DURATION = 12000; // 12 seconds of speed effect

// Difficulty scaling system
let difficultyLevel = 'normal'; // 'normal', 'survival', or 'alliance'
let lastDifficultyCheck = 0;
const DIFFICULTY_CHECK_INTERVAL = 5000; // Check every 5 seconds
const EDIBLE_THRESHOLD = 0.5; // 50% of animals must be edible to trigger survival mode
const ALLIANCE_THRESHOLD = 0.9; // 90% of animals must be smaller to trigger alliance mode
let allianceActive = false; // Track if animals are actively teaming up
let lastAllianceCheck = 0;

// Configuration
const MAX_PLANTS = 10000; // Maximum number of plants in the garden
const REMOVE_BATCH_SIZE = 100; // Number of oldest plants to remove when cap is reached
const INITIAL_BORDER_TREES = 50; // Initial trees on the border
const MAX_BORDER_TREES = 100; // Maximum border trees
const MASSIVE_TRANSACTION_THRESHOLD = 10000; // $10k threshold for new trees
const GARDEN_RADIUS = 80; // Radius for border tree placement

// Stablecoin colors - nature-inspired, vibrant colors
const STABLECOIN_COLORS = {
    USDC: 0x4A90E2,  // Sky blue - like morning sky
    USDT: 0x50C878,  // Emerald green - like fresh leaves
    DAI: 0xFFD700   // Golden yellow - like sunflowers
};

// Statistics
const stats = {
    total: 0,
    USDC: 0,
    USDT: 0,
    DAI: 0,
    currentPlants: 0,  // Track current plant count
    currentAnimals: 0, // Track current animal count
    moneyCollected: 0  // Track money collected from eating animals
};

// Initialize stats.moneyCollected to match global moneyCollected
stats.moneyCollected = 0;

// Transaction plant class - represents a transaction as a growing plant
class TransactionPlant {
    constructor(stablecoin, amount, from, to) {
        this.stablecoin = stablecoin;
        this.amount = parseFloat(amount);
        this.from = from;
        this.to = to;
        
        // Calculate final size based on amount (logarithmic scale)
        const amountLog = Math.log10(this.amount + 1);
        this.targetHeight = Math.min(Math.max(amountLog * 5 + 2, 2), 30); // Height: 2-30 units
        this.stemWidth = Math.min(Math.max(amountLog * 0.3 + 0.1, 0.1), 2); // Width: 0.1-2 units
        
        // Create plant group
        this.mesh = new THREE.Group();
        
        // Random position in garden
        this.mesh.position.x = (Math.random() - 0.5) * 80;
        this.mesh.position.y = -30; // Start at ground level
        this.mesh.position.z = (Math.random() - 0.5) * 80;
        
        // Get plant color based on stablecoin
        this.baseColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
        
        // Growth parameters
        this.growthProgress = 0;
        this.growthSpeed = 0.02 + Math.random() * 0.01; // Vary growth speed slightly
        this.swayPhase = Math.random() * Math.PI * 2;
        
        // Create plant based on amount
        if (this.amount < 1000) {
            this.createSmallPlant(); // Small flower
        } else if (this.amount < 10000) {
            this.createMediumPlant(); // Medium bush/flower
        } else if (this.amount < 50000) {
            this.createLargePlant(); // Large flowering plant
        } else {
            this.createGiantPlant(); // Majestic tree
        }
        
        // Start small (will grow)
        this.mesh.scale.set(0.01, 0.01, 0.01);
        
        this.age = 0;
        this.isPersistent = true; // Plants are now persistent
        this.isFullyGrown = false;
        this.createdAt = Date.now(); // Track creation time for removal order
    }
    
    createSmallPlant() {
        // Small flower with stem
        this.plantType = 'flower';
        
        // Stem - reduced segments for performance
        const stemGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 0.5, 
            this.stemWidth, 
            this.targetHeight,
            4, // Reduced segments
            1
        );
        const stemMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2D5016 // Dark green stem
        });
        this.stem = new THREE.Mesh(stemGeometry, stemMaterial);
        this.stem.position.y = this.targetHeight / 2;
        this.stem.castShadow = false; // Disable shadows for small plants
        this.mesh.add(this.stem);
        
        // Flower petals - reduced geometry
        const petalCount = 5;
        this.petals = [];
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeometry = new THREE.SphereGeometry(this.stemWidth * 2, 4, 3); // Reduced segments
            const petalMaterial = new THREE.MeshLambertMaterial({ // Use simpler material
                color: this.baseColor
            });
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.position.set(
                Math.cos(angle) * this.stemWidth * 3,
                this.targetHeight,
                Math.sin(angle) * this.stemWidth * 3
            );
            petal.scale.set(1, 0.6, 1);
            this.petals.push(petal);
            this.mesh.add(petal);
        }
        
        // Center of flower - reduced geometry
        const centerGeometry = new THREE.SphereGeometry(this.stemWidth * 1.5, 4, 3);
        const centerMaterial = new THREE.MeshLambertMaterial({
            color: 0xFFFF00 // Yellow center
        });
        this.center = new THREE.Mesh(centerGeometry, centerMaterial);
        this.center.position.y = this.targetHeight;
        this.mesh.add(this.center);
    }
    
    createMediumPlant() {
        // Medium flowering bush
        this.plantType = 'bush';
        
        // Main bush body (multiple spheres)
        const bushParts = 3 + Math.floor(Math.random() * 2);
        this.bushes = [];
        for (let i = 0; i < bushParts; i++) {
            const bushGeometry = new THREE.SphereGeometry(
                this.targetHeight / 3 + Math.random() * 2, 
                8, 
                6
            );
            const bushMaterial = new THREE.MeshLambertMaterial({
                color: 0x2F4F2F // Dark green
            });
            const bush = new THREE.Mesh(bushGeometry, bushMaterial);
            bush.position.set(
                (Math.random() - 0.5) * this.targetHeight / 3,
                this.targetHeight / 3 + i * 2,
                (Math.random() - 0.5) * this.targetHeight / 3
            );
            bush.castShadow = true;
            this.bushes.push(bush);
            this.mesh.add(bush);
        }
        
        // Add flowers on bush
        const flowerCount = 5 + Math.floor(this.amount / 2000);
        this.flowers = [];
        for (let i = 0; i < flowerCount; i++) {
            const flowerGeometry = new THREE.SphereGeometry(0.8, 6, 4);
            const flowerMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.3
            });
            const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
            const angle = Math.random() * Math.PI * 2;
            const radius = this.targetHeight / 3 + Math.random() * 2;
            flower.position.set(
                Math.cos(angle) * radius,
                this.targetHeight / 2 + Math.random() * this.targetHeight / 2,
                Math.sin(angle) * radius
            );
            this.flowers.push(flower);
            this.mesh.add(flower);
        }
    }
    
    createLargePlant() {
        // Large ornamental plant with trunk and flowers
        this.plantType = 'ornamental';
        
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 2,
            this.stemWidth * 3,
            this.targetHeight * 0.6
        );
        const trunkMaterial = new THREE.MeshLambertMaterial({
            color: 0x4A3C28 // Brown trunk
        });
        this.trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        this.trunk.position.y = this.targetHeight * 0.3;
        this.trunk.castShadow = true;
        this.mesh.add(this.trunk);
        
        // Foliage layers
        const layers = 3;
        this.foliage = [];
        for (let i = 0; i < layers; i++) {
            const layerGeometry = new THREE.ConeGeometry(
                this.targetHeight / 2.5 - i * 2,
                this.targetHeight / 4,
                8
            );
            const layerMaterial = new THREE.MeshLambertMaterial({
                color: 0x228B22
            });
            const layer = new THREE.Mesh(layerGeometry, layerMaterial);
            layer.position.y = this.targetHeight * 0.5 + i * this.targetHeight / 6;
            layer.castShadow = true;
            this.foliage.push(layer);
            this.mesh.add(layer);
        }
        
        // Large flowers
        const flowerCount = Math.floor(this.amount / 5000);
        this.flowers = [];
        for (let i = 0; i < flowerCount; i++) {
            const flowerGeometry = new THREE.SphereGeometry(1.5, 8, 6);
            const flowerMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.4
            });
            const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
            const angle = (i / flowerCount) * Math.PI * 2;
            flower.position.set(
                Math.cos(angle) * this.targetHeight / 3,
                this.targetHeight * 0.7 + Math.random() * this.targetHeight * 0.2,
                Math.sin(angle) * this.targetHeight / 3
            );
            this.flowers.push(flower);
            this.mesh.add(flower);
        }
    }
    
    createGiantPlant() {
        // Majestic tree for whale transactions
        this.plantType = 'tree';
        
        // Thick trunk
        const trunkGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 3,
            this.stemWidth * 4,
            this.targetHeight * 0.5
        );
        const trunkMaterial = new THREE.MeshLambertMaterial({
            color: 0x654321
        });
        this.trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        this.trunk.position.y = this.targetHeight * 0.25;
        this.trunk.castShadow = true;
        this.mesh.add(this.trunk);
        
        // Crown (multiple large spheres)
        const crownParts = 5;
        this.crown = [];
        for (let i = 0; i < crownParts; i++) {
            const crownGeometry = new THREE.SphereGeometry(
                this.targetHeight / 3 + Math.random() * 3,
                12,
                8
            );
            const crownMaterial = new THREE.MeshLambertMaterial({
                color: 0x0F7938
            });
            const crownPart = new THREE.Mesh(crownGeometry, crownMaterial);
            const angle = (i / crownParts) * Math.PI * 2;
            crownPart.position.set(
                Math.cos(angle) * this.targetHeight / 6,
                this.targetHeight * 0.6 + Math.random() * this.targetHeight * 0.2,
                Math.sin(angle) * this.targetHeight / 6
            );
            crownPart.castShadow = true;
            this.crown.push(crownPart);
            this.mesh.add(crownPart);
        }
        
        // Glowing fruits for massive transactions
        const fruitCount = Math.floor(this.amount / 20000);
        this.fruits = [];
        for (let i = 0; i < fruitCount; i++) {
            const fruitGeometry = new THREE.SphereGeometry(1, 8, 6);
            const fruitMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.6
            });
            const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
            const angle = Math.random() * Math.PI * 2;
            const height = this.targetHeight * 0.5 + Math.random() * this.targetHeight * 0.3;
            const radius = Math.random() * this.targetHeight / 3;
            fruit.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            this.fruits.push(fruit);
            this.mesh.add(fruit);
        }
        
        // Add aura for whale transactions
        if (this.amount > 100000) {
            const auraGeometry = new THREE.SphereGeometry(this.targetHeight * 0.8, 16, 12);
            const auraMaterial = new THREE.MeshBasicMaterial({
                color: this.baseColor,
                transparent: true,
                opacity: 0.1,
                side: THREE.BackSide
            });
            this.aura = new THREE.Mesh(auraGeometry, auraMaterial);
            this.aura.position.y = this.targetHeight * 0.6;
            this.mesh.add(this.aura);
        }
    }
    
    update() {
        if (isPaused) return;
        
        // Grow the plant
        if (this.growthProgress < 1) {
            this.growthProgress = Math.min(this.growthProgress + this.growthSpeed, 1);
            
            // Smooth growth curve (ease-out)
            const growthCurve = 1 - Math.pow(1 - this.growthProgress, 3);
            this.mesh.scale.set(growthCurve, growthCurve, growthCurve);
            
            // Mark as fully grown
            if (this.growthProgress >= 1) {
                this.isFullyGrown = true;
            }
        }
        
        // Calculate distance from camera for LOD
        const distance = camera.position.distanceTo(this.mesh.position);
        const isNear = distance < 50;
        const isMedium = distance < 100;
        
        // Only animate if close enough
        if (isMedium) {
            // Sway animation (wind effect)
            const swayAmount = this.isFullyGrown ? 0.03 : 0.01;
            const time = Date.now() * 0.001;
            this.mesh.rotation.z = Math.sin(time + this.swayPhase) * swayAmount;
            this.mesh.rotation.x = Math.cos(time * 0.7 + this.swayPhase) * swayAmount * 0.5;
        }
        
        // Only animate detailed parts if very close
        if (isNear) {
            const time = Date.now() * 0.001;
            
            // Animate specific plant parts
            if (this.plantType === 'flower' && this.petals) {
                // Petals open and close slightly
                this.petals.forEach((petal, i) => {
                    const petalPhase = i * 0.5;
                    petal.scale.y = 0.6 + Math.sin(time * 0.5 + petalPhase) * 0.1;
                });
            } else if (this.plantType === 'tree' && this.fruits) {
                // Fruits bob slightly
                this.fruits.forEach((fruit, i) => {
                    fruit.position.y += Math.sin(time * 2 + i) * 0.01;
                });
                
                // Pulse aura for whale transactions
                if (this.aura) {
                    this.aura.material.opacity = 0.1 + Math.sin(time * 3) * 0.05;
                    this.aura.scale.set(
                        1 + Math.sin(time * 2) * 0.1,
                        1 + Math.sin(time * 2) * 0.1,
                        1 + Math.sin(time * 2) * 0.1
                    );
                }
            } else if (this.flowers) {
                // Flowers on bushes/ornamental plants glow pulse
                this.flowers.forEach((flower, i) => {
                    if (flower.material.emissiveIntensity !== undefined) {
                        flower.material.emissiveIntensity = 0.3 + Math.sin(time * 2 + i * 0.5) * 0.2;
                    }
                });
            }
        }
        
        // Hide very distant plants for performance
        this.mesh.visible = distance < 150;
        
        // Plants are now persistent - no automatic fading
        this.age++;
        
        // Return true to keep the plant alive (persistent)
        return this.isPersistent;
    }
    
    // Method to dispose of the plant when removed
    dispose() {
        // Dispose of all geometries and materials in the plant
        this.mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}

// Transaction animal class - represents a transaction as a moving animal
class TransactionAnimal {
    constructor(stablecoin, amount, from, to) {
        this.stablecoin = stablecoin;
        this.amount = parseFloat(amount);
        this.from = from;
        this.to = to;
        this.isAlive = true;
        this.id = Math.random(); // Unique ID for tie-breaking in merge decisions
        
        // Animal size based on amount
        const amountLog = Math.log10(this.amount + 1);
        this.size = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4); // 0.5-4 units
        
        // Create animal group
        this.mesh = new THREE.Group();
        
        // Random spawn position with safe zone around player
        const safeRadius = 25; // Minimum spawn distance from player
        let spawnX, spawnZ;
        
        do {
            spawnX = (Math.random() - 0.5) * 80;
            spawnZ = (Math.random() - 0.5) * 80;
        } while (playerControls.mesh && 
                 Math.sqrt(spawnX * spawnX + spawnZ * spawnZ) < safeRadius);
        
        this.mesh.position.x = spawnX;
        this.mesh.position.y = -30 + this.size; // Start on ground
        this.mesh.position.z = spawnZ;
        
        // Movement properties
        this.velocity = new THREE.Vector3();
        this.targetDirection = Math.random() * Math.PI * 2;
        this.baseSpeed = 0.2 + Math.random() * 0.5; // Much slower base speed (was 0.5-2, now 0.2-0.7)
        this.speed = this.baseSpeed;
        this.turnSpeed = 0.02 + Math.random() * 0.02; // Slower turning
        this.jumpCooldown = 0;
        
        // Pathfinding properties
        this.detectionRange = 15; // Range at which animals detect player (15 units)
        this.fleeRange = 12; // Range at which prey starts fleeing (12 units)
        this.chaseRange = 20; // Range at which predators start chasing (20 units)
        this.behaviorState = 'wandering'; // 'wandering', 'fleeing', 'chasing'
        this.lastPlayerSighting = null;
        
        // AI State properties for survival mode
        this.aiState = 'roaming'; // 'roaming', 'hunting', 'eating', 'growing', 'merging'
        this.targetAnimal = null; // Target animal for hunting or merging
        this.huntingCooldown = Date.now(); // Timestamp for hunting cooldown
        this.originalSize = this.size; // Store original size for growth tracking
        this.growthFromEating = 0; // How much size gained from eating other animals
        this.mergePartner = null; // Partner for alliance merging
        this.hasMerged = false; // Flag to prevent double-merging
        
        // Get animal color based on stablecoin
        this.baseColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
        
        // Create animal based on amount
        if (this.amount < 100) {
            this.createSmallAnimal(); // Rabbit
            this.animalType = 'rabbit';
            this.baseSpeed *= 1.2; // Rabbits are slightly faster
            this.speed = this.baseSpeed;
            this.chaseSpeed = 1.0; // Won't really chase (too small)
            this.fleeSpeed = this.baseSpeed * 1.4; // Moderate speed boost when fleeing
        } else if (this.amount < 1000) {
            this.createMediumAnimal(); // Fox
            this.animalType = 'fox';
            this.speed = this.baseSpeed; // Initialize current speed
            this.chaseSpeed = 3.0; // Slow stalking (15% of new player speed)
            this.fleeSpeed = this.baseSpeed * 1.3; // Moderate fleeing boost
        } else if (this.amount < 10000) {
            this.createLargeAnimal(); // Deer
            this.animalType = 'deer';
            this.baseSpeed *= 0.9; // Deer are slightly slower
            this.speed = this.baseSpeed;
            this.chaseSpeed = 4.0; // Persistent pursuit (20% of new player speed)
            this.fleeSpeed = this.baseSpeed * 1.25; // Small flee boost
        } else {
            this.createGiantAnimal(); // Bear (whale transaction)
            this.animalType = 'bear';
            this.baseSpeed *= 0.6; // Bears are slower but valuable
            this.speed = this.baseSpeed;
            this.chaseSpeed = 2.5; // Very slow menacing walk (12.5% of new player speed)
            this.fleeSpeed = this.baseSpeed * 1.1; // Bears barely speed up when fleeing
        }
        
        // Start with small scale for spawn animation
        this.mesh.scale.set(0.01, 0.01, 0.01);
        this.growthProgress = 0;
        
        this.age = 0;
        this.createdAt = Date.now();
    }
    
    createSmallAnimal() {
        // Rabbit - small and quick
        // Body
        const bodyGeometry = new THREE.SphereGeometry(this.size * 0.8, 6, 4);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: this.baseColor
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.size * 0.5;
        this.mesh.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(this.size * 0.5, 6, 4);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(this.size * 0.6, this.size * 0.7, 0);
        this.mesh.add(head);
        
        // Ears
        for (let i = -1; i <= 1; i += 2) {
            const earGeometry = new THREE.ConeGeometry(this.size * 0.2, this.size * 0.6, 4);
            const ear = new THREE.Mesh(earGeometry, bodyMaterial);
            ear.position.set(this.size * 0.6, this.size * 1.2, i * this.size * 0.2);
            this.mesh.add(ear);
        }
        
        // Tail (fluffy)
        const tailGeometry = new THREE.SphereGeometry(this.size * 0.3, 4, 4);
        const tailMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xFFFFFF
        });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(-this.size * 0.6, this.size * 0.5, 0);
        this.mesh.add(tail);
    }
    
    createMediumAnimal() {
        // Fox - cunning and agile
        // Body
        const bodyGeometry = new THREE.BoxGeometry(this.size * 1.5, this.size * 0.8, this.size * 0.8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: this.baseColor
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.size * 0.5;
        this.mesh.add(body);
        
        // Head
        const headGeometry = new THREE.ConeGeometry(this.size * 0.5, this.size * 0.8, 6);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.rotation.z = Math.PI / 2;
        head.position.set(this.size * 0.9, this.size * 0.6, 0);
        this.mesh.add(head);
        
        // Tail (bushy)
        const tailGeometry = new THREE.ConeGeometry(this.size * 0.4, this.size * 1.2, 6);
        const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        tail.rotation.z = -Math.PI / 3;
        tail.position.set(-this.size * 0.9, this.size * 0.7, 0);
        this.mesh.add(tail);
        
        // Legs
        for (let x = -0.5; x <= 0.5; x += 1) {
            for (let z = -0.3; z <= 0.3; z += 0.6) {
                const legGeometry = new THREE.CylinderGeometry(this.size * 0.1, this.size * 0.1, this.size * 0.5);
                const leg = new THREE.Mesh(legGeometry, bodyMaterial);
                leg.position.set(x * this.size, this.size * 0.2, z * this.size);
                this.mesh.add(leg);
            }
        }
    }
    
    createLargeAnimal() {
        // Deer - majestic and valuable
        // Body
        const bodyGeometry = new THREE.BoxGeometry(this.size * 2, this.size, this.size);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: this.baseColor
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.size * 0.8;
        this.mesh.add(body);
        
        // Head
        const headGeometry = new THREE.BoxGeometry(this.size * 0.6, this.size * 0.6, this.size * 0.5);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(this.size * 1.2, this.size * 1, 0);
        this.mesh.add(head);
        
        // Antlers (for high value)
        if (this.amount > 5000) {
            for (let side = -1; side <= 1; side += 2) {
                const antlerGeometry = new THREE.ConeGeometry(this.size * 0.15, this.size * 0.8, 4);
                const antlerMaterial = new THREE.MeshLambertMaterial({ 
                    color: 0x8B4513
                });
                const antler = new THREE.Mesh(antlerGeometry, antlerMaterial);
                antler.position.set(this.size * 1.2, this.size * 1.5, side * this.size * 0.3);
                this.mesh.add(antler);
            }
        }
        
        // Legs (long)
        for (let x = -0.6; x <= 0.6; x += 1.2) {
            for (let z = -0.3; z <= 0.3; z += 0.6) {
                const legGeometry = new THREE.CylinderGeometry(this.size * 0.12, this.size * 0.1, this.size * 0.8);
                const leg = new THREE.Mesh(legGeometry, bodyMaterial);
                leg.position.set(x * this.size, this.size * 0.3, z * this.size);
                this.mesh.add(leg);
            }
        }
    }
    
    createGiantAnimal() {
        // Bear - whale transaction, slow but extremely valuable
        // Body (massive)
        const bodyGeometry = new THREE.SphereGeometry(this.size * 1.2, 8, 6);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: this.baseColor
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.size;
        body.scale.set(1.3, 1, 1);
        this.mesh.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(this.size * 0.6, 6, 4);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(this.size * 1.2, this.size * 1.1, 0);
        this.mesh.add(head);
        
        // Glowing aura for whale transactions
        if (this.amount > 50000) {
            const auraGeometry = new THREE.SphereGeometry(this.size * 2, 12, 8);
            const auraMaterial = new THREE.MeshBasicMaterial({
                color: this.baseColor,
                transparent: true,
                opacity: 0.2,
                side: THREE.BackSide
            });
            this.aura = new THREE.Mesh(auraGeometry, auraMaterial);
            this.aura.position.y = this.size;
            this.mesh.add(this.aura);
        }
        
        // Paws
        for (let x = -0.6; x <= 0.6; x += 1.2) {
            for (let z = -0.4; z <= 0.4; z += 0.8) {
                const pawGeometry = new THREE.SphereGeometry(this.size * 0.3, 4, 4);
                const paw = new THREE.Mesh(pawGeometry, bodyMaterial);
                paw.position.set(x * this.size, this.size * 0.2, z * this.size);
                this.mesh.add(paw);
            }
        }
    }
    
    update() {
        // Grow on spawn
        if (this.growthProgress < 1) {
            this.growthProgress = Math.min(this.growthProgress + 0.05, 1);
            const scale = this.growthProgress;
            this.mesh.scale.set(scale, scale, scale);
        }
        
        if (!this.isAlive || isPaused) return true;
        
        // Update threat indicator based on player size
        this.updateThreatIndicator();
        
        // Update AI behavior based on difficulty level (handles player interaction and survival mode)
        this.updateAIBehavior();
        
        // Basic movement behavior - tree avoidance and wandering
        const avoidanceDirection = this.getTreeAvoidanceDirection();
        if (avoidanceDirection !== null) {
            const directionDiff = avoidanceDirection - this.targetDirection;
            let normalizedDiff = directionDiff;
            while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
            while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;
            
            this.targetDirection += normalizedDiff * 0.15;
        }
        
        // Random wandering behavior when not actively hunting, fleeing, chasing, or merging
        if ((this.aiState === 'roaming' || this.aiState === 'growing') && this.behaviorState === 'wandering' && this.aiState !== 'merging') {
            this.targetDirection += (Math.random() - 0.5) * this.turnSpeed;
            
            // Return to base speed when wandering
            if (this.speed !== this.baseSpeed) {
                this.speed = this.speed * 0.95 + this.baseSpeed * 0.05;
            }
        }
        
        // For merging animals, ensure they're actually moving
        if (this.aiState === 'merging' && this.mergePartner) {
            // seekMergePartner already set targetDirection and speed
            // Just make sure we're not stuck
            if (this.speed < 3.0) {
                this.speed = 5.0; // Force movement speed
            }
        }
        
        // Apply movement
        this.velocity.x = Math.sin(this.targetDirection) * this.speed * 0.1;
        this.velocity.z = Math.cos(this.targetDirection) * this.speed * 0.1;
        
        // Check for tree collisions before moving
        const nextPosition = this.mesh.position.clone().add(this.velocity);
        const collisionResult = this.checkTreeCollisions(nextPosition);
        if (collisionResult.hasCollision) {
            // Calculate bounce direction based on the closest tree
            const bounceDirection = this.calculateBounceDirection(collisionResult.closestTree);
            this.targetDirection = bounceDirection;
            
            // Adjust velocity immediately
            this.velocity.x = Math.sin(this.targetDirection) * this.speed * 0.1;
            this.velocity.z = Math.cos(this.targetDirection) * this.speed * 0.1;
            
            // Add a small jump when bouncing
            if (this.jumpCooldown <= 0) {
                this.velocity.y = 2 + Math.random() * 2;
                this.jumpCooldown = 30;
            }
        }
        
        // Apply gravity
        this.velocity.y -= 0.3;
        
        // Update position
        this.mesh.position.add(this.velocity);
        
        // Ground collision
        const groundLevel = -30 + this.size;
        if (this.mesh.position.y < groundLevel) {
            this.mesh.position.y = groundLevel;
            this.velocity.y = 0;
        }
        
        // Keep within bounds
        const boundary = 90;
        if (Math.abs(this.mesh.position.x) > boundary) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * boundary;
            this.targetDirection += Math.PI; // Turn around
        }
        if (Math.abs(this.mesh.position.z) > boundary) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * boundary;
            this.targetDirection += Math.PI; // Turn around
        }
        
        // Face movement direction
        this.mesh.rotation.y = -this.targetDirection;
        
        // Animate based on movement
        const wobble = Math.sin(Date.now() * 0.01) * 0.1;
        this.mesh.rotation.z = wobble * this.velocity.x * 0.1;
        
        // Update cooldowns
        if (this.jumpCooldown > 0) this.jumpCooldown--;
        
        // Pulse aura for whale transactions
        if (this.aura) {
            this.aura.material.opacity = 0.2 + Math.sin(Date.now() * 0.003) * 0.1;
        }
        
        // Update cooldowns
        if (this.jumpCooldown > 0) this.jumpCooldown--;
        
        this.age++;
        return this.isAlive;
    }
    
    // New AI behavior system for survival and alliance modes
    updateAIBehavior() {
        // If actively merging, that takes absolute priority
        if (this.aiState === 'merging') {
            this.handleAllianceMode();
            return; // Skip all other behaviors when merging
        }
        
        // Alliance mode: check for merging opportunities
        if (difficultyLevel === 'alliance') {
            this.handleAllianceMode();
            // Alliance animals not merging still react to player
            if (this.aiState !== 'merging' && playerControls.mesh) {
                this.handlePlayerInteraction();
            }
        }
        // Survival mode: animals hunt each other
        else if (difficultyLevel === 'survival') {
            this.handleSurvivalMode();
            // Survival animals also react to player when not hunting
            if (this.aiState !== 'hunting' && playerControls.mesh) {
                this.handlePlayerInteraction();
            }
        }
        // Normal behavior - react to player if close
        else if (playerControls.mesh) {
            this.handlePlayerInteraction();
        }
    }
    
    // Handle alliance mode behavior (merging)
    handleAllianceMode() {
        // If this animal has a merge partner, seek them
        if (this.aiState === 'merging' && this.mergePartner) {
            // Verify partner still has us as their merge partner
            if (this.mergePartner.mergePartner !== this) {
                console.log(`⚠️ ${this.animalType} lost mutual partnership with ${this.mergePartner.animalType}, resetting`);
                this.aiState = 'roaming';
                this.mergePartner = null;
                this.hasMerged = false;
            } else {
                this.seekMergePartner();
            }
        }
        // Otherwise handle survival mode behaviors too
        else if (difficultyLevel === 'survival') {
            this.handleSurvivalMode();
        }
    }
    
    // Handle player interaction with intelligent pathfinding
    handlePlayerInteraction() {
        if (!playerControls.mesh || !playerControls.isPlaying) {
            this.behaviorState = 'wandering';
            this.speed = this.baseSpeed;
            return;
        }
        
        const distanceToPlayer = playerControls.mesh.position.distanceTo(this.mesh.position);
        const isSmaller = this.size < playerControls.size;
        const isLarger = this.size > playerControls.size;
        
        // Detection logic - animals only react within detection range
        if (distanceToPlayer > this.detectionRange) {
            // Outside detection range - wander normally
            if (this.behaviorState !== 'wandering') {
                this.behaviorState = 'wandering';
                this.speed = this.baseSpeed;
            }
            return;
        }
        
        // PREY BEHAVIOR - Smaller animals flee (also check if within range for newly smaller animals)
        if (isSmaller && (distanceToPlayer < this.fleeRange || this.behaviorState === 'chasing')) {
            // Check if behavior needs to change (was chasing but now should flee)
            if (this.behaviorState === 'chasing') {
                console.log(`🔄 ${this.animalType} switching from chasing to fleeing - player grew bigger!`);
            }
            if (this.behaviorState !== 'fleeing') {
                this.behaviorState = 'fleeing';
                console.log(`🏃 ${this.animalType} fleeing from player at distance ${distanceToPlayer.toFixed(1)}`);
            }
            
            // Calculate flee direction (away from player)
            const fleeDirection = new THREE.Vector3();
            fleeDirection.subVectors(this.mesh.position, playerControls.mesh.position);
            fleeDirection.y = 0;
            fleeDirection.normalize();
            
            // Smart fleeing - try to zigzag occasionally
            const zigzag = Math.sin(Date.now() * 0.003) * 0.3;
            const fleeAngle = Math.atan2(fleeDirection.x, fleeDirection.z) + zigzag;
            
            // Smooth turning toward flee direction
            const directionDiff = this.normalizeAngle(fleeAngle - this.targetDirection);
            this.targetDirection += directionDiff * 0.25; // Responsive turning
            
            // Use fixed flee speed with small panic modifier based on proximity
            const panicFactor = 1 - (distanceToPlayer / this.fleeRange);
            const baseFlee = this.fleeSpeed || (this.baseSpeed * 1.2); // Fallback if fleeSpeed not set
            this.speed = baseFlee * (1 + panicFactor * 0.15); // Add only up to 15% more speed when very close
            
            // Store last player sighting for smarter fleeing
            this.lastPlayerSighting = playerControls.mesh.position.clone();
        }
        // PREDATOR BEHAVIOR - Larger animals chase (also check for newly larger animals)
        // Reduce chase range for animals that are MUCH bigger (less aggressive when huge)
        const sizeRatio = this.size / playerControls.size;
        let adjustedChaseRange = this.chaseRange;
        
        // Significantly reduce chase range based on size difference
        if (sizeRatio > 1.5) {
            // Much more aggressive reduction in chase range
            // At 1.5x size: 50% range (10 units)
            // At 2x size: 25% range (5 units)
            // At 3x size: 15% range (3 units)
            // At 4x+ size: 10% range (2 units)
            const rangeMultiplier = Math.max(0.1, 0.75 - (sizeRatio - 1.5) * 0.3);
            adjustedChaseRange = this.chaseRange * rangeMultiplier;
        }
        
        if (isLarger && (distanceToPlayer < adjustedChaseRange || this.behaviorState === 'fleeing')) {
            // Check if behavior needs to change (was fleeing but now should chase)
            if (this.behaviorState === 'fleeing') {
                console.log(`🔄 ${this.animalType} switching from fleeing to chasing - player shrank!`);
            }
            if (this.behaviorState !== 'chasing') {
                this.behaviorState = 'chasing';
                if (sizeRatio > 1.5) {
                    console.log(`🦥 ${this.animalType} lazily pursuing (${sizeRatio.toFixed(1)}x bigger, range reduced to ${adjustedChaseRange.toFixed(1)} units)`);
                } else {
                    console.log(`🎯 ${this.animalType} actively hunting player at distance ${distanceToPlayer.toFixed(1)}`);
                }
            }
            
            // Calculate predictive chase direction (lead the target)
            const playerVelocity = playerControls.velocity.clone();
            const predictTime = distanceToPlayer / (this.baseSpeed * 0.1); // Use predator's speed for prediction
            const predictedPosition = playerControls.mesh.position.clone();
            predictedPosition.add(playerVelocity.clone().multiplyScalar(predictTime * 0.3)); // Partial prediction
            
            const chaseDirection = new THREE.Vector3();
            chaseDirection.subVectors(predictedPosition, this.mesh.position);
            chaseDirection.y = 0;
            chaseDirection.normalize();
            
            // Calculate chase angle
            const chaseAngle = Math.atan2(chaseDirection.x, chaseDirection.z);
            
            // Smooth but determined turning toward player
            const directionDiff = this.normalizeAngle(chaseAngle - this.targetDirection);
            this.targetDirection += directionDiff * 0.2; // Moderate turning speed
            
            // Use fixed chase speed for this animal type
            // Further reduce speed for animals that are MUCH bigger
            let effectiveChaseSpeed = this.chaseSpeed || 3.5;
            
            // Significantly slow down animals that are much bigger
            if (sizeRatio > 1.5) {
                // Much slower chase speeds for big animals
                // At 1.5x: 70% speed
                // At 2x: 50% speed
                // At 3x: 30% speed
                // At 4x+: 20% speed
                const speedMultiplier = Math.max(0.2, 1.0 - (sizeRatio - 1.5) * 0.4);
                effectiveChaseSpeed = effectiveChaseSpeed * speedMultiplier;
            }
            
            this.speed = effectiveChaseSpeed;
            
            // Store last player sighting
            this.lastPlayerSighting = playerControls.mesh.position.clone();
        }
        // NEUTRAL BEHAVIOR - Similar size or outside immediate threat/chase range
        else {
            // Check if we need to stop chasing/fleeing due to size change
            if (this.behaviorState === 'chasing' && !isLarger) {
                console.log(`🛑 ${this.animalType} stops chasing - no longer bigger than player`);
                this.behaviorState = 'wandering';
                this.speed = this.baseSpeed;
            } else if (this.behaviorState === 'fleeing' && !isSmaller) {
                console.log(`🛑 ${this.animalType} stops fleeing - no longer smaller than player`);
                this.behaviorState = 'wandering';
                this.speed = this.baseSpeed;
            }
            // Gradually return to wandering for other cases
            else if (this.behaviorState !== 'wandering') {
                // Smooth transition back to wandering
                this.speed = this.speed * 0.9 + this.baseSpeed * 0.1;
                if (Math.abs(this.speed - this.baseSpeed) < 0.1) {
                    this.behaviorState = 'wandering';
                    this.speed = this.baseSpeed;
                }
            }
            
            // If we have a last sighting and are fleeing, continue fleeing for a bit
            if (this.lastPlayerSighting && this.behaviorState === 'fleeing') {
                const timeSinceSighting = Date.now() - (this.lastSightingTime || Date.now());
                if (timeSinceSighting < 2000) { // Continue fleeing for 2 seconds after losing sight
                    const fleeDirection = new THREE.Vector3();
                    fleeDirection.subVectors(this.mesh.position, this.lastPlayerSighting);
                    fleeDirection.y = 0;
                    fleeDirection.normalize();
                    
                    const fleeAngle = Math.atan2(fleeDirection.x, fleeDirection.z);
                    const directionDiff = this.normalizeAngle(fleeAngle - this.targetDirection);
                    this.targetDirection += directionDiff * 0.15;
                } else {
                    this.lastPlayerSighting = null;
                }
            }
        }
        
        // Update last sighting time
        if (distanceToPlayer < this.detectionRange) {
            this.lastSightingTime = Date.now();
        }
    }
    
    // Handle survival mode behavior (animal vs animal)
    handleSurvivalMode() {
        const currentTime = Date.now();
        
        switch (this.aiState) {
            case 'roaming':
                // Look for smaller animals to hunt - use time-based cooldown
                if (currentTime - this.huntingCooldown > 5000 && Math.random() < 0.05) { // 5% chance per frame, 5s cooldown
                    this.findTargetToHunt();
                }
                break;
                
            case 'hunting':
                if (this.targetAnimal && this.targetAnimal.isAlive) {
                    this.huntTarget();
                } else {
                    // Target lost, return to roaming
                    this.aiState = 'roaming';
                    this.targetAnimal = null;
                    this.huntingCooldown = currentTime; // Set cooldown timestamp
                }
                break;
                
            case 'eating':
                // Brief state, will be handled by animalEatAnimal function
                break;
                
            case 'growing':
                // Brief pause state after eating, timeout handled by animalEatAnimal function
                break;
                
            case 'merging':
                // Alliance mode - seek merge partner
                if (this.mergePartner && this.mergePartner.isAlive) {
                    this.seekMergePartner();
                } else {
                    // Lost partner, return to roaming
                    this.aiState = 'roaming';
                    this.mergePartner = null;
                }
                break;
        }
    }
    
    // Seek merge partner during alliance mode
    seekMergePartner() {
        if (!this.mergePartner || !this.mergePartner.isAlive) {
            console.log(`🔴 ${this.animalType} lost merge partner, returning to roaming`);
            this.aiState = 'roaming';
            this.mergePartner = null;
            this.hasMerged = false; // Reset merge flag
            return;
        }
        
        const distance = this.mesh.position.distanceTo(this.mergePartner.mesh.position);
        const mergeRange = this.size + this.mergePartner.size + 3; // Larger merge range
        
        // Debug every frame to see what's happening
        if (Math.random() < 0.05) {
            console.log(`📍 ${this.animalType} → ${this.mergePartner.animalType} | Distance: ${distance.toFixed(1)} | Range: ${mergeRange.toFixed(1)} | Speed: ${this.speed.toFixed(1)}`);
        }
        
        if (distance < mergeRange) {
            // Close enough to merge! 
            // Check if partner is also in merging state and they're pointing at each other
            if (this.mergePartner.aiState === 'merging' && this.mergePartner.mergePartner === this) {
                // Use a consistent rule to decide who initiates (e.g., larger size, or if equal, use unique ID)
                const shouldInitiate = this.size > this.mergePartner.size || 
                    (this.size === this.mergePartner.size && this.id > this.mergePartner.id);
                
                if (shouldInitiate && !this.hasMerged) {
                    console.log(`✅ MERGING NOW: ${this.animalType} (${this.size.toFixed(1)}) absorbing ${this.mergePartner.animalType} (${this.mergePartner.size.toFixed(1)})`);
                    // Set flags to prevent double-merging
                    this.hasMerged = true;
                    this.mergePartner.hasMerged = true;
                    
                    // Call the global mergeAnimals function
                    if (typeof mergeAnimals === 'function') {
                        mergeAnimals(this, this.mergePartner);
                    } else {
                        console.error('❌ mergeAnimals function not found!');
                    }
                }
            } else {
                if (this.mergePartner.aiState !== 'merging') {
                    console.log(`⚠️ Partner ${this.mergePartner.animalType} not in merge state!`);
                }
                if (this.mergePartner.mergePartner !== this) {
                    console.log(`⚠️ Partner ${this.mergePartner.animalType} doesn't have us as merge partner!`);
                }
            }
        } else {
            // Move toward merge partner
            const moveDirection = new THREE.Vector3();
            moveDirection.subVectors(this.mergePartner.mesh.position, this.mesh.position);
            moveDirection.y = 0;
            
            if (moveDirection.length() > 0) {
                moveDirection.normalize();
                
                // Direct movement toward partner
                this.targetDirection = Math.atan2(moveDirection.x, moveDirection.z);
                
                // Ultra-high speed for merging in panic mode
                const dominanceFactor = playerControls.size / Math.max(this.size, 1);
                if (dominanceFactor > 5) {
                    this.speed = 15.0; // PANIC SPEED!
                } else if (dominanceFactor > 3) {
                    this.speed = 12.0; // Very fast
                } else {
                    this.speed = 8.0; // Fast
                }
                
                // Visual pulse effect
                const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.1;
                this.mesh.scale.setScalar((this.size / this.originalSize) * pulse);
            }
        }
    }
    
    // Find a smaller animal to hunt
    findTargetToHunt() {
        const huntingRange = 25; // Range to look for prey
        let bestTarget = null;
        let bestDistance = huntingRange;
        
        animals.forEach(otherAnimal => {
            if (otherAnimal === this || !otherAnimal.isAlive) return;
            
            // Can only hunt significantly smaller animals
            if (otherAnimal.size < this.size * 0.8) {
                const distance = this.mesh.position.distanceTo(otherAnimal.mesh.position);
                if (distance < bestDistance) {
                    bestTarget = otherAnimal;
                    bestDistance = distance;
                }
            }
        });
        
        if (bestTarget) {
            this.targetAnimal = bestTarget;
            this.aiState = 'hunting';
            this.speed = this.baseSpeed * 1.3; // Small speed boost while hunting
            console.log(`🎯 ${this.animalType} started hunting ${bestTarget.animalType} (distance: ${bestDistance.toFixed(1)})`);
        }
    }
    
    // Hunt the target animal
    huntTarget() {
        if (!this.targetAnimal || !this.targetAnimal.isAlive) {
            this.aiState = 'roaming';
            this.targetAnimal = null;
            return;
        }
        
        const distance = this.mesh.position.distanceTo(this.targetAnimal.mesh.position);
        const catchRange = this.size + this.targetAnimal.size + 0.5;
        
        if (distance < catchRange) {
            // Caught the prey!
            this.aiState = 'eating';
            animalEatAnimal(this, this.targetAnimal);
        } else {
            // Chase the target
            const chaseDirection = new THREE.Vector3();
            chaseDirection.subVectors(this.targetAnimal.mesh.position, this.mesh.position);
            chaseDirection.y = 0;
            chaseDirection.normalize();
            
            const chaseAngle = Math.atan2(chaseDirection.x, chaseDirection.z);
            const directionDiff = chaseAngle - this.targetDirection;
            let normalizedDiff = this.normalizeAngle(directionDiff);
            
            this.targetDirection += normalizedDiff * 0.3; // More aggressive turning while hunting
            
            // Give up if too far away
            if (distance > 35) {
                this.aiState = 'roaming';
                this.targetAnimal = null;
                this.huntingCooldown = Date.now(); // Set timestamp cooldown
                this.speed /= 1.5; // Return to normal speed
            }
        }
    }
    
    // Helper function to normalize angle differences
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }
    
    // Update threat indicator with floating icons above animals
    updateThreatIndicator() {
        if (!playerControls.isPlaying || !playerControls.mesh) {
            // Remove indicators when not playing
            if (this.indicator) {
                this.mesh.remove(this.indicator);
                if (this.indicator.geometry) this.indicator.geometry.dispose();
                if (this.indicator.material) this.indicator.material.dispose();
                this.indicator = null;
            }
            return;
        }
        
        // Show indicator when within reasonable viewing distance (increased for better planning)
        const distance = playerControls.mesh.position.distanceTo(this.mesh.position);
        const indicatorDistance = 30; // Show indicators at 30 units for strategic planning
        
        if (distance > indicatorDistance) {
            // Remove indicator when player is far
            if (this.indicator) {
                this.mesh.remove(this.indicator);
                if (this.indicator.geometry) this.indicator.geometry.dispose();
                if (this.indicator.material) this.indicator.material.dispose();
                this.indicator = null;
            }
            return;
        }
        
        // Determine threat level and icon type
        let iconType, iconColor, backgroundColor;
        const sizeRatio = this.size / playerControls.size;
        
        if (sizeRatio >= 0.95 && sizeRatio <= 1.05) {
            // Equal size - white with circle icon (will bounce)
            iconType = 'equal';
            iconColor = 0x000000; // Black icon on white background
            backgroundColor = 0xFFFFFF; // White background
        } else if (this.size < playerControls.size * 1.2) {
            // Edible - green with food icon (changed from 0.8 to 1.2)
            iconType = 'edible';
            iconColor = 0xFFFFFF;
            backgroundColor = 0x00FF00;
        } else {
            // Dangerous - red with warning icon (anything >= 1.2x player size)
            iconType = 'danger';
            iconColor = 0xFFFFFF;
            backgroundColor = 0xFF0000;
        }
        
        // Create or update floating icon indicator
        if (!this.indicator) {
            this.indicator = this.createFloatingIcon(iconType, iconColor, backgroundColor);
            this.mesh.add(this.indicator);
        } else {
            // Update existing indicator if type changed
            this.updateFloatingIcon(this.indicator, iconType, iconColor, backgroundColor);
        }
        
        // Position icon above animal with gentle floating
        const time = Date.now() * 0.001;
        const floatOffset = Math.sin(time * 2 + this.createdAt * 0.001) * 0.5;
        this.indicator.position.y = this.size * 2 + 2 + floatOffset;
        
        // Scale and opacity based on distance (adjusted for 30 unit range)
        const distanceFactor = Math.max(0.4, 1 - (distance / indicatorDistance * 0.8));
        this.indicator.scale.setScalar(distanceFactor * 1.2); // Slightly larger overall for visibility
        
        // Make indicator face the camera
        if (camera) {
            this.indicator.lookAt(camera.position);
        }
    }
    
    // Create floating icon indicator
    createFloatingIcon(iconType, iconColor, backgroundColor) {
        const iconGroup = new THREE.Group();
        
        // Background circle
        const bgGeometry = new THREE.CircleGeometry(1.2, 12);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: backgroundColor,
            transparent: true,
            opacity: 0.9
        });
        const background = new THREE.Mesh(bgGeometry, bgMaterial);
        iconGroup.add(background);
        
        // Icon symbol based on type
        const iconGeometry = this.getIconGeometry(iconType);
        const iconMaterial = new THREE.MeshBasicMaterial({
            color: iconColor,
            transparent: true,
            opacity: 1.0
        });
        const icon = new THREE.Mesh(iconGeometry, iconMaterial);
        icon.position.z = 0.01; // Slightly in front of background
        iconGroup.add(icon);
        
        // Add border for better visibility
        const borderGeometry = new THREE.RingGeometry(1.2, 1.4, 12);
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.6
        });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        iconGroup.add(border);
        
        iconGroup.userData = { iconType, iconColor, backgroundColor };
        return iconGroup;
    }
    
    // Get geometry for different icon types
    getIconGeometry(iconType) {
        switch (iconType) {
            case 'edible':
                // Fork and knife or plus symbol for edible
                return this.createPlusIconGeometry();
            case 'danger':
                // Skull or X symbol for danger
                return this.createXIconGeometry();
            case 'equal':
                // Circle symbol for equal size (will bounce)
                return this.createCircleIconGeometry();
            case 'neutral':
            default:
                // Equals or dash symbol for neutral
                return this.createEqualsIconGeometry();
        }
    }
    
    // Create plus icon geometry (edible)
    createPlusIconGeometry() {
        const shape = new THREE.Shape();
        // Vertical bar
        shape.moveTo(-0.2, -0.8);
        shape.lineTo(0.2, -0.8);
        shape.lineTo(0.2, 0.8);
        shape.lineTo(-0.2, 0.8);
        shape.lineTo(-0.2, -0.8);
        // Horizontal bar
        shape.moveTo(-0.8, -0.2);
        shape.lineTo(0.8, -0.2);
        shape.lineTo(0.8, 0.2);
        shape.lineTo(-0.8, 0.2);
        shape.lineTo(-0.8, -0.2);
        
        return new THREE.ShapeGeometry(shape);
    }
    
    // Create X icon geometry (danger)
    createXIconGeometry() {
        const shape = new THREE.Shape();
        // Create X shape with two diagonal rectangles
        const width = 0.3;
        const length = 1.2;
        
        // First diagonal
        shape.moveTo(-width/2, -length/2);
        shape.lineTo(width/2, -length/2);
        shape.lineTo(length/2, -width/2);
        shape.lineTo(length/2, width/2);
        shape.lineTo(width/2, length/2);
        shape.lineTo(-width/2, length/2);
        shape.lineTo(-length/2, width/2);
        shape.lineTo(-length/2, -width/2);
        shape.lineTo(-width/2, -length/2);
        
        return new THREE.ShapeGeometry(shape);
    }
    
    // Create equals icon geometry (neutral)
    createEqualsIconGeometry() {
        const shape = new THREE.Shape();
        // Top bar
        shape.moveTo(-0.6, 0.2);
        shape.lineTo(0.6, 0.2);
        shape.lineTo(0.6, 0.4);
        shape.lineTo(-0.6, 0.4);
        shape.lineTo(-0.6, 0.2);
        // Bottom bar
        shape.moveTo(-0.6, -0.4);
        shape.lineTo(0.6, -0.4);
        shape.lineTo(0.6, -0.2);
        shape.lineTo(-0.6, -0.2);
        shape.lineTo(-0.6, -0.4);
        
        return new THREE.ShapeGeometry(shape);
    }
    
    // Create circle icon geometry (equal size - will bounce)
    createCircleIconGeometry() {
        // Create a ring/circle outline
        const outerRadius = 0.7;
        const innerRadius = 0.5;
        const segments = 16;
        
        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
        return geometry;
    }
    
    // Update existing floating icon
    updateFloatingIcon(indicator, iconType, iconColor, backgroundColor) {
        if (indicator.userData.iconType !== iconType) {
            // Type changed, recreate icon
            const newIcon = this.createFloatingIcon(iconType, iconColor, backgroundColor);
            const position = indicator.position.clone();
            const scale = indicator.scale.clone();
            
            this.mesh.remove(indicator);
            if (indicator.geometry) indicator.geometry.dispose();
            if (indicator.material) indicator.material.dispose();
            
            this.indicator = newIcon;
            this.indicator.position.copy(position);
            this.indicator.scale.copy(scale);
            this.mesh.add(this.indicator);
        } else {
            // Same type, just update colors if needed
            const background = indicator.children[0];
            const icon = indicator.children[1];
            if (background) background.material.color.set(backgroundColor);
            if (icon) icon.material.color.set(iconColor);
        }
    }
    
    // Check collision with border trees
    checkTreeCollisions(position) {
        if (borderTrees.length === 0) return { hasCollision: false, closestTree: null };
        
        let closestTree = null;
        let minDistance = Infinity;
        let hasCollision = false;
        
        // Check collision with each border tree
        for (let tree of borderTrees) {
            const distance = position.distanceTo(tree.mesh.position);
            const collisionDistance = this.size + 4; // Tree trunk radius + animal size
            
            if (distance < minDistance) {
                minDistance = distance;
                closestTree = tree;
            }
            
            if (distance < collisionDistance) {
                hasCollision = true;
            }
        }
        
        return { hasCollision, closestTree, distance: minDistance };
    }
    
    // Calculate bounce direction away from tree
    calculateBounceDirection(tree) {
        if (!tree) return this.targetDirection + Math.PI;
        
        // Calculate direction away from the tree
        const directionAway = new THREE.Vector3();
        directionAway.subVectors(this.mesh.position, tree.mesh.position);
        directionAway.y = 0; // Keep on horizontal plane
        directionAway.normalize();
        
        // Convert to angle with some randomness
        const baseAngle = Math.atan2(directionAway.x, directionAway.z);
        const randomOffset = (Math.random() - 0.5) * Math.PI * 0.5; // ±45 degrees
        
        return baseAngle + randomOffset;
    }
    
    // Get direction to avoid nearby trees
    getTreeAvoidanceDirection() {
        if (borderTrees.length === 0) return null;
        
        const avoidanceRadius = this.size * 8; // Start avoiding when 8x animal size away
        let avoidanceVector = new THREE.Vector3(0, 0, 0);
        let treesNearby = 0;
        
        for (let tree of borderTrees) {
            const distance = this.mesh.position.distanceTo(tree.mesh.position);
            
            if (distance < avoidanceRadius) {
                // Calculate repulsion force (stronger when closer)
                const repulsion = new THREE.Vector3();
                repulsion.subVectors(this.mesh.position, tree.mesh.position);
                repulsion.y = 0;
                
                if (repulsion.length() > 0) {
                    repulsion.normalize();
                    // Inverse square law for repulsion strength
                    const strength = (avoidanceRadius - distance) / avoidanceRadius;
                    repulsion.multiplyScalar(strength * strength);
                    avoidanceVector.add(repulsion);
                    treesNearby++;
                }
            }
        }
        
        if (treesNearby === 0) return null;
        
        // Convert avoidance vector to angle
        if (avoidanceVector.length() > 0) {
            avoidanceVector.normalize();
            return Math.atan2(avoidanceVector.x, avoidanceVector.z);
        }
        
        return null;
    }
    
    // Called when eaten
    consume() {
        this.isAlive = false;
        // Return the value consumed
        return this.amount;
    }
    
    dispose() {
        // Clean up merge partner if we had one
        if (this.mergePartner && this.mergePartner.isAlive) {
            console.log(`🔓 Freeing ${this.mergePartner.animalType} from broken merge (partner disposed)`);
            this.mergePartner.aiState = 'roaming';
            this.mergePartner.mergePartner = null;
            this.mergePartner.hasMerged = false;
        }
        
        if (this.indicator) {
            this.mesh.remove(this.indicator);
            // Dispose of all parts of the floating icon
            this.indicator.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        this.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}

// Garden elements storage
let gardenElements = [];
let animals = []; // Track animals separately for collision detection
let plants = []; // Track plants separately for collision detection
let borderTrees = []; // Persistent border trees that grow fruits
let borderTreePositions = []; // Store border positions for new tree spawning

// Create player animal
function createPlayer() {
    if (playerControls.mesh) {
        scene.remove(playerControls.mesh);
        playerControls.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    
    // Create player as a special colored animal
    const playerGroup = new THREE.Group();
    
    // Body (sphere that will grow)
    const bodyGeometry = new THREE.SphereGeometry(playerControls.size, 8, 6);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x9B59B6, // Purple for player
        emissive: 0x9B59B6,
        emissiveIntensity: 0.2
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = playerControls.size;
    body.castShadow = true;
    playerGroup.add(body);
    
    // Eyes to show direction
    for (let i = -1; i <= 1; i += 2) {
        const eyeGeometry = new THREE.SphereGeometry(playerControls.size * 0.15, 4, 4);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        eye.position.set(playerControls.size * 0.6, playerControls.size * 1.2, i * playerControls.size * 0.3);
        playerGroup.add(eye);
        
        // Pupils
        const pupilGeometry = new THREE.SphereGeometry(playerControls.size * 0.08, 4, 4);
        const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        pupil.position.set(playerControls.size * 0.7, playerControls.size * 1.2, i * playerControls.size * 0.3);
        playerGroup.add(pupil);
    }
    
    // Add size indicator text (optional)
    playerControls.mesh = playerGroup;
    playerControls.mesh.position.set(0, -30 + playerControls.size, 0);
    scene.add(playerControls.mesh);
    
    // Update camera to follow player
    updateCameraFollow();
}

// Update camera to follow player
function updateCameraFollow() {
    if (!playerControls.isPlaying || !playerControls.mesh) return;
    
    // Third person camera following player
    const cameraDistance = 30 + playerControls.size * 5;
    const cameraHeight = 15 + playerControls.size * 3;
    
    camera.position.x = playerControls.mesh.position.x - Math.sin(playerControls.rotation) * cameraDistance;
    camera.position.y = playerControls.mesh.position.y + cameraHeight;
    camera.position.z = playerControls.mesh.position.z - Math.cos(playerControls.rotation) * cameraDistance;
    
    camera.lookAt(playerControls.mesh.position);
}

// Update player movement
function updatePlayerMovement(delta) {
    if (!playerControls.isPlaying || gameOver || !playerControls.mesh) return;
    
    // Ground-based movement physics
    const speed = playerControls.speed * (1 + playerControls.size * 0.1); // Bigger = slightly faster
    
    // Calculate movement direction based on camera
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    
    // Apply movement
    const moveVector = new THREE.Vector3();
    
    if (playerControls.moveForward) moveVector.add(forward);
    if (playerControls.moveBackward) moveVector.sub(forward);
    if (playerControls.moveLeft) moveVector.sub(right);
    if (playerControls.moveRight) moveVector.add(right);
    
    // Handle rotation with Q and E keys
    if (playerControls.rotateLeft) {
        playerControls.rotation -= playerControls.rotationSpeed;
    }
    if (playerControls.rotateRight) {
        playerControls.rotation += playerControls.rotationSpeed;
    }
    
    if (moveVector.length() > 0) {
        moveVector.normalize();
        moveVector.multiplyScalar(speed * delta);
        
        // Apply boost if shift is held
        if (playerControls.boost) {
            moveVector.multiplyScalar(2);
        }
        
        // Update position
        playerControls.mesh.position.add(moveVector);
        
        // Keep player on ground
        playerControls.mesh.position.y = playerControls.size * 0.5 - 30;
        
        // Rotate player to face movement direction
        if (moveVector.length() > 0.01) {
            const targetRotation = Math.atan2(moveVector.x, moveVector.z);
            playerControls.mesh.rotation.y = targetRotation;
        }
    }
    
    // Keep player in bounds
    const boundary = 95;
    playerControls.mesh.position.x = Math.max(-boundary, Math.min(boundary, playerControls.mesh.position.x));
    playerControls.mesh.position.z = Math.max(-boundary, Math.min(boundary, playerControls.mesh.position.z));
}

// Check collision between player and animals/plants
function checkCollisions() {
    if (!playerControls.isPlaying || gameOver || !playerControls.mesh) return;
    
    const playerPos = playerControls.mesh.position;
    const playerRadius = playerControls.size;
    
    // Check collisions with power-up fruits first
    for (let i = powerUpFruits.length - 1; i >= 0; i--) {
        const fruit = powerUpFruits[i];
        const distance = playerPos.distanceTo(fruit.position);
        
        if (distance < playerRadius + 1.2) { // Power-up fruit collision
            collectPowerUpFruit(fruit, i);
        }
    }
    
    // Check collisions with leverage fruits
    for (let i = leverageFruits.length - 1; i >= 0; i--) {
        const fruit = leverageFruits[i];
        const distance = playerPos.distanceTo(fruit.position);
        
        if (distance < playerRadius + 1.5) { // Leverage fruit collision (slightly larger radius)
            collectLeverageFruit(fruit, i);
        }
    }
    
    // Check collisions with speedrun fruits
    for (let i = speedrunFruits.length - 1; i >= 0; i--) {
        const fruit = speedrunFruits[i];
        const distance = playerPos.distanceTo(fruit.position);
        
        if (distance < playerRadius + 1.4) { // Speedrun fruit collision
            collectSpeedrunFruit(fruit, i);
        }
    }
    
    // Check collisions with animals
    for (let i = animals.length - 1; i >= 0; i--) {
        const animal = animals[i];
        const distance = playerPos.distanceTo(animal.mesh.position);
        const collisionDistance = playerRadius + animal.size;
        
        if (distance < collisionDistance) {
            // Check size ratio for collision outcome
            const sizeRatio = animal.size / playerControls.size;
            
            if (sizeRatio < 0.95) {
                // Clearly smaller - eat it
                eatAnimal(animal, i);
            } else if (sizeRatio >= 0.95 && sizeRatio <= 1.05) {
                // Similar size (within 5%) - bounce off each other
                const pushDirection = new THREE.Vector3()
                    .subVectors(playerPos, animal.mesh.position)
                    .normalize();
                
                // Push both away from each other
                const pushForce = (collisionDistance - distance) * 0.5;
                playerControls.mesh.position.add(pushDirection.multiplyScalar(pushForce));
                animal.mesh.position.add(pushDirection.multiplyScalar(-pushForce));
                
                // Add some lateral movement to help unstick
                const lateralPush = new THREE.Vector3(-pushDirection.z, 0, pushDirection.x);
                animal.velocity.add(lateralPush.multiplyScalar(2));
                
                console.log(`⚡ Bounced off similar-sized ${animal.animalType} (ratio: ${sizeRatio.toFixed(2)})`);
            } else if (sizeRatio > 1.05 && sizeRatio < 1.2) {
                // Slightly larger but still edible - try to eat but with resistance
                if (Math.random() < 0.7) { // 70% chance to succeed
                    eatAnimal(animal, i);
                } else {
                    // Bounce off
                    const pushDirection = new THREE.Vector3()
                        .subVectors(playerPos, animal.mesh.position)
                        .normalize();
                    playerControls.mesh.position.add(pushDirection.multiplyScalar((collisionDistance - distance) * 0.3));
                }
            } else if (sizeRatio >= 1.2) {
                // Clearly larger - death
                handlePlayerDeath();
                return;
            }
        }
    }
    
    // Check collisions with border trees (obstacles, not deadly)
    borderTrees.forEach(tree => {
        if (tree.mesh) {
            const distance = playerPos.distanceTo(tree.mesh.position);
            const collisionDistance = playerRadius + 3; // Tree trunk radius
            
            if (distance < collisionDistance) {
                // Push player away from tree
                const pushDirection = new THREE.Vector3()
                    .subVectors(playerPos, tree.mesh.position)
                    .normalize();
                playerControls.mesh.position.add(pushDirection.multiplyScalar(collisionDistance - distance));
            }
        }
    });
}

// Handle eating an animal
function eatAnimal(animal, index) {
    // Clean up merge partner if this animal was merging
    if (animal.mergePartner && animal.mergePartner.isAlive) {
        console.log(`🔓 Freeing ${animal.mergePartner.animalType} from broken merge partnership (eaten by player)`);
        animal.mergePartner.aiState = 'roaming';
        animal.mergePartner.mergePartner = null;
        animal.mergePartner.hasMerged = false;
    }
    
    // Mark as not alive before removal
    animal.isAlive = false;
    
    // Add to money collected
    moneyCollected += animal.amount;
    
    // Grow natural player size (not affected by leverage)
    const growthFactor = Math.log10(animal.amount + 1) * 0.1;
    const oldNaturalSize = naturalPlayerSize;
    naturalPlayerSize = Math.min(naturalPlayerSize + growthFactor, 10); // Max natural size of 10
    
    // Update displayed size with leverage multiplier applied
    const oldDisplaySize = playerControls.size;
    playerControls.size = naturalPlayerSize * currentLeverageMultiplier;
    
    console.log(`Animal eaten: $${animal.amount.toFixed(2)} → Growth: +${growthFactor.toFixed(3)} (Natural: ${oldNaturalSize.toFixed(3)} → ${naturalPlayerSize.toFixed(3)}, Display: ${oldDisplaySize.toFixed(3)} → ${playerControls.size.toFixed(3)})`);
    
    // Update player mesh scale
    playerControls.mesh.scale.setScalar(playerControls.size);
    playerControls.mesh.position.y = playerControls.size * 0.5 - 30;
    
    // Remove animal
    scene.remove(animal.mesh);
    animals.splice(index, 1);
    
    // Update UI
    updateStats();
    
    // Play eat sound effect (visual feedback)
    flashScreen(0x00ff00, 100);
}

// Handle collecting a power-up fruit
function collectPowerUpFruit(fruit, index) {
    // Add a life (up to maximum)
    if (gameState.lives < gameState.maxLives) {
        gameState.lives++;
        console.log(`Life collected! Lives: ${gameState.lives}/${gameState.maxLives}`);
    } else {
        // Give bonus money instead if lives are maxed
        moneyCollected += 1000;
        console.log('Lives maxed! Received $1000 bonus instead!');
    }
    
    // Remove fruit from scene and arrays
    scene.remove(fruit);
    fruit.geometry.dispose();
    fruit.material.dispose();
    powerUpFruits.splice(index, 1);
    
    // Update UI
    updateStats();
    
    // Show collection effect
    showLifeCollectionEffect(fruit.position);
    
    // Flash screen pink
    flashScreen(0xFF69B4, 150);
}

// Collect leverage fruit and apply size effect
function collectLeverageFruit(fruit, index) {
    const currentTime = Date.now();
    
    // Check if this is within the double-eat window
    let sizeMultiplier = 2.0;
    if (currentTime - lastLeverageFruitEaten <= LEVERAGE_DOUBLE_EAT_WINDOW && leverageEaten === 1) {
        sizeMultiplier = 4.0;
        leverageEaten = 2;
        console.log('DOUBLE EAT! 4x size boost activated!');
    } else {
        leverageEaten = 1;
        console.log('Leverage fruit collected! 2x size boost activated!');
    }
    
    // Apply the new leverage multiplier to natural size
    currentLeverageMultiplier = sizeMultiplier;
    playerControls.size = naturalPlayerSize * currentLeverageMultiplier;
    
    // Update player mesh size
    if (playerControls.mesh) {
        playerControls.mesh.scale.setScalar(playerControls.size);
        playerControls.mesh.position.y = playerControls.size * 0.5 - 30;
    }
    
    // Set leverage state
    leverageActive = true;
    lastLeverageFruitEaten = currentTime;
    
    // Clear any existing timer
    if (leverageEffectTimer) {
        clearTimeout(leverageEffectTimer);
    }
    
    // Set timer to reset size after effect duration
    leverageEffectTimer = setTimeout(() => {
        resetLeverageEffect();
    }, LEVERAGE_EFFECT_DURATION);
    
    // Update all animal threat indicators since player size changed
    updateAnimalIndicators();
    
    // Remove fruit from scene and arrays
    scene.remove(fruit);
    fruit.geometry.dispose();
    fruit.material.dispose();
    leverageFruits.splice(index, 1);
    
    // Show collection effect
    showLeverageCollectionEffect(fruit.position, sizeMultiplier);
    
    // Flash screen gold
    flashScreen(0xFFD700, 200);
    
    console.log(`Player size increased to ${playerControls.size.toFixed(1)} (${sizeMultiplier}x boost)`);
}

// Reset leverage effect back to normal size
function resetLeverageEffect() {
    if (leverageActive) {
        // Reset to natural size (no multiplier)
        currentLeverageMultiplier = 1.0;
        playerControls.size = naturalPlayerSize;
        
        // Update player mesh size
        if (playerControls.mesh) {
            playerControls.mesh.scale.setScalar(playerControls.size);
            playerControls.mesh.position.y = playerControls.size * 0.5 - 30;
        }
        
        leverageActive = false;
        leverageEaten = 0;
        leverageEffectTimer = null;
        
        // Update all animal threat indicators since player size changed
        updateAnimalIndicators();
        
        console.log(`Leverage effect expired. Player size reset to natural size: ${playerControls.size.toFixed(1)}`);
    }
}

// Show leverage collection visual effect
function showLeverageCollectionEffect(position, multiplier) {
    const effectGroup = new THREE.Group();
    
    // Create golden star particles
    const particleCount = multiplier === 4.0 ? 12 : 8; // More particles for 4x effect
    for (let i = 0; i < particleCount; i++) {
        const starGeometry = new THREE.ConeGeometry(0.4, 0.8, 6);
        const starMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            emissive: 0xFF8C00,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.95
        });
        const star = new THREE.Mesh(starGeometry, starMaterial);
        
        star.position.set(
            (Math.random() - 0.5) * 4,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 4
        );
        
        // Random rotation for star effect
        star.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        effectGroup.add(star);
    }
    
    effectGroup.position.copy(position);
    scene.add(effectGroup);
    
    // Animate the leverage collection effect
    let animationTime = 0;
    const animateCollection = () => {
        animationTime += 0.04;
        
        effectGroup.children.forEach((star, idx) => {
            star.position.y += 0.5;
            star.material.opacity -= 0.04;
            star.rotation.y += 0.4;
            star.rotation.x += 0.2;
            star.scale.multiplyScalar(multiplier === 4.0 ? 1.02 : 1.01); // Grow faster for 4x effect
        });
        
        if (animationTime < 1 && effectGroup.children.length > 0) {
            requestAnimationFrame(animateCollection);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateCollection();
}

// Update animal threat indicators when player size changes
function updateAnimalIndicators() {
    // This will be called to refresh all animal indicators
    // The indicator logic in the main animation loop will handle the actual updates
    console.log('Updating animal threat indicators for new player size');
}

// Show life collection visual effect
function showLifeCollectionEffect(position) {
    const effectGroup = new THREE.Group();
    
    // Create heart particles
    for (let i = 0; i < 8; i++) {
        const heartGeometry = new THREE.SphereGeometry(0.3, 6, 4);
        const heartMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF69B4,
            transparent: true,
            opacity: 0.9
        });
        const heart = new THREE.Mesh(heartGeometry, heartMaterial);
        
        const angle = (i / 8) * Math.PI * 2;
        heart.position.set(
            Math.cos(angle) * 2,
            position.y,
            Math.sin(angle) * 2
        );
        
        effectGroup.add(heart);
    }
    
    scene.add(effectGroup);
    
    // Animate the effect
    let animationTime = 0;
    const animateEffect = () => {
        animationTime += 0.02;
        
        effectGroup.children.forEach((heart, index) => {
            heart.position.y += 0.2;
            heart.material.opacity -= 0.02;
            heart.rotation.y += 0.1;
            
            // Spiral outward
            const angle = (index / 8) * Math.PI * 2 + animationTime * 2;
            const radius = 2 + animationTime * 3;
            heart.position.x = Math.cos(angle) * radius;
            heart.position.z = Math.sin(angle) * radius;
        });
        
        if (animationTime < 1) {
            requestAnimationFrame(animateEffect);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateEffect();
}

// Handle player death (lose a life or game over)
function handlePlayerDeath() {
    gameState.lives--;
    
    if (gameState.lives > 0) {
        // Player has lives left - respawn
        console.log(`Player died! Lives remaining: ${gameState.lives}`);
        
        // Flash screen red
        flashScreen(0xFF0000, 200);
        
        // Reset player position to center
        playerControls.mesh.position.set(0, playerControls.size * 0.5 - 30, 0);
        playerControls.velocity.set(0, 0, 0);
        
        // Show death notification
        showDeathNotification();
        
        updateStats();
    } else {
        // No lives left - game over
        handleGameOver();
    }
}

// Show death notification
function showDeathNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #FF4444, #CC0000);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        font-size: 20px;
        font-weight: bold;
        z-index: 2000;
        text-align: center;
        box-shadow: 0 10px 30px rgba(255, 68, 68, 0.4);
    `;
    notification.innerHTML = `
        <div>💀 EATEN! 💀</div>
        <div style="margin-top: 10px; font-size: 16px;">Lives Remaining: ${gameState.lives}</div>
        <div style="margin-top: 5px; font-size: 14px;">Respawning...</div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 2 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    }, 2000);
}

// Flash screen effect
function flashScreen(color, duration) {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
    flash.style.opacity = '0.3';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '9999';
    document.body.appendChild(flash);
    
    setTimeout(() => {
        document.body.removeChild(flash);
    }, duration);
}

// Handle game over
function handleGameOver() {
    gameOver = true;
    playerControls.isPlaying = false;
    
    // Create game over screen
    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'game-over';
    gameOverDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        font-size: 24px;
        z-index: 10000;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
    `;
    
    gameOverDiv.innerHTML = `
        <h1 style="margin: 0 0 20px 0; font-size: 48px;">GAME OVER!</h1>
        <p style="margin: 20px 0;">You were eaten by a larger animal!</p>
        <p style="margin: 20px 0; font-size: 32px; color: #FFD700;">💰 Final Score: $${moneyCollected.toFixed(2)}</p>
        <p style="margin: 10px 0; font-size: 18px;">Your Size: ${playerControls.size.toFixed(2)}</p>
        <button onclick="location.reload()" style="
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 20px;
            cursor: pointer;
            margin-top: 20px;
        ">🔄 Play Again</button>
    `;
    
    document.body.appendChild(gameOverDiv);
    
    // Stop animation
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Initialize Three.js scene
function init() {
    // Scene with sky gradient
    scene = new THREE.Scene();
    
    // Create gradient background (sky)
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue at top
    gradient.addColorStop(0.4, '#98D8E8'); // Lighter blue
    gradient.addColorStop(0.7, '#FDB777'); // Sunset orange
    gradient.addColorStop(1, '#FDD085'); // Warm horizon
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 512);
    
    const skyTexture = new THREE.CanvasTexture(canvas);
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(0xf0f4f7, 50, 200);
    
    // Camera
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 20, 80);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting - more natural for garden
    const ambientLight = new THREE.AmbientLight(0xffefd5, 0.5); // Warm ambient
    scene.add(ambientLight);
    
    // Sun light
    const sunLight = new THREE.DirectionalLight(0xfffaf0, 0.8);
    sunLight.position.set(30, 50, 20);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);
    
    // Create garden floor (grass)
    const grassGeometry = new THREE.PlaneGeometry(200, 200);
    const grassMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x7CBA3F,
        side: THREE.DoubleSide
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -30;
    grass.receiveShadow = true;
    scene.add(grass);
    
    // Create garden elements
    createGardenElements();
    
    // Create initial border trees
    createInitialBorderTrees();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Create garden environment
function createGardenElements() {
    // Create trees
    for (let i = 0; i < 8; i++) {
        const tree = createTree();
        const angle = (i / 8) * Math.PI * 2;
        const radius = 60 + Math.random() * 20;
        tree.position.set(
            Math.cos(angle) * radius,
            -30,
            Math.sin(angle) * radius
        );
        tree.scale.set(
            0.8 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4
        );
        scene.add(tree);
        gardenElements.push(tree);
    }
    
    // Create flower patches
    for (let i = 0; i < 15; i++) {
        const flowerPatch = createFlowerPatch();
        flowerPatch.position.set(
            (Math.random() - 0.5) * 100,
            -30,
            (Math.random() - 0.5) * 100
        );
        scene.add(flowerPatch);
        gardenElements.push(flowerPatch);
    }
    
    // Create bushes
    for (let i = 0; i < 10; i++) {
        const bush = createBush();
        bush.position.set(
            (Math.random() - 0.5) * 120,
            -30,
            (Math.random() - 0.5) * 120
        );
        scene.add(bush);
        gardenElements.push(bush);
    }
    
    // Create garden path
    createGardenPath();
}

// Create a tree
function createTree() {
    const tree = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(1.5, 2, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 4;
    trunk.castShadow = true;
    tree.add(trunk);
    
    // Foliage (multiple spheres for organic look)
    const foliageColors = [0x228B22, 0x32CD32, 0x3CB371];
    for (let i = 0; i < 3; i++) {
        const radius = 5 + Math.random() * 2;
        const foliageGeometry = new THREE.SphereGeometry(radius, 8, 6);
        const foliageMaterial = new THREE.MeshLambertMaterial({ 
            color: foliageColors[i]
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(
            (Math.random() - 0.5) * 3,
            10 + i * 2,
            (Math.random() - 0.5) * 3
        );
        foliage.castShadow = true;
        tree.add(foliage);
    }
    
    return tree;
}

// Create flower patch
function createFlowerPatch() {
    const patch = new THREE.Group();
    const flowerColors = [0xFF69B4, 0xFFB6C1, 0xFFA07A, 0xFFFF00, 0xFF1493];
    
    for (let i = 0; i < 5; i++) {
        // Stem
        const stemGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2);
        const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.set(
            (Math.random() - 0.5) * 3,
            1,
            (Math.random() - 0.5) * 3
        );
        
        // Flower
        const flowerGeometry = new THREE.SphereGeometry(0.5, 6, 4);
        const flowerMaterial = new THREE.MeshLambertMaterial({ 
            color: flowerColors[Math.floor(Math.random() * flowerColors.length)]
        });
        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
        flower.position.set(
            stem.position.x,
            2.5,
            stem.position.z
        );
        
        patch.add(stem);
        patch.add(flower);
    }
    
    return patch;
}

// Create bush
function createBush() {
    const bushGeometry = new THREE.SphereGeometry(3, 8, 6);
    const bushMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2F4F2F
    });
    const bush = new THREE.Mesh(bushGeometry, bushMaterial);
    bush.position.y = 2;
    bush.scale.set(1.5, 0.8, 1.5);
    bush.castShadow = true;
    return bush;
}

// Create garden path
function createGardenPath() {
    const pathGeometry = new THREE.PlaneGeometry(10, 100);
    const pathMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xD2B48C,
        side: THREE.DoubleSide
    });
    const path = new THREE.Mesh(pathGeometry, pathMaterial);
    path.rotation.x = -Math.PI / 2;
    path.position.y = -29.9;
    scene.add(path);
    
    // Add stepping stones
    for (let i = -40; i < 40; i += 8) {
        const stoneGeometry = new THREE.CylinderGeometry(2, 2, 0.3, 8);
        const stoneMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x808080
        });
        const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
        stone.position.set(
            (Math.random() - 0.5) * 2,
            -29.8,
            i + (Math.random() - 0.5) * 2
        );
        stone.rotation.x = Math.PI / 2;
        scene.add(stone);
    }
}

// Create initial border trees around the perimeter
function createInitialBorderTrees() {
    borderTrees = [];
    borderTreePositions = [];
    
    for (let i = 0; i < INITIAL_BORDER_TREES; i++) {
        const angle = (i / INITIAL_BORDER_TREES) * Math.PI * 2;
        const radius = GARDEN_RADIUS + Math.random() * 10; // Some variation in distance
        
        const position = {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            y: -30
        };
        
        // Create border tree
        const tree = createBorderTree(position, 'neutral');
        borderTrees.push(tree);
        borderTreePositions.push(position);
        scene.add(tree.mesh);
    }
    
    console.log(`Created ${INITIAL_BORDER_TREES} initial border trees`);
}

// Create a border tree (enhanced version of createTree)
function createBorderTree(position, stablecoin = 'neutral') {
    const tree = {
        mesh: new THREE.Group(),
        position: position,
        fruits: [], // Array to hold fruits
        stablecoin: stablecoin,
        createdAt: Date.now()
    };
    
    tree.mesh.position.set(position.x, position.y, position.z);
    
    // Trunk - larger for border trees
    const trunkGeometry = new THREE.CylinderGeometry(2, 3, 12);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 6;
    trunk.castShadow = true;
    tree.mesh.add(trunk);
    
    // Foliage - multiple layers for fuller look
    const foliageColors = [0x228B22, 0x32CD32, 0x3CB371, 0x90EE90];
    for (let i = 0; i < 4; i++) {
        const radius = 6 + Math.random() * 3;
        const foliageGeometry = new THREE.SphereGeometry(radius, 12, 8);
        const foliageMaterial = new THREE.MeshLambertMaterial({ 
            color: foliageColors[i]
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(
            (Math.random() - 0.5) * 4,
            12 + i * 2,
            (Math.random() - 0.5) * 4
        );
        foliage.castShadow = true;
        tree.mesh.add(foliage);
    }
    
    // Add some initial fruits if not neutral
    if (stablecoin !== 'neutral') {
        addFruitToTree(tree, stablecoin, 1000);
    }
    
    return tree;
}

// Add fruit to a specific tree
function addFruitToTree(tree, stablecoin, amount) {
    // Create fruit based on stablecoin type
    const fruitColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
    
    // Size based on amount (but keep reasonable)
    const size = Math.min(Math.max(Math.log10(amount + 1) * 0.2, 0.3), 1.5);
    
    const fruitGeometry = new THREE.SphereGeometry(size, 8, 6);
    const fruitMaterial = new THREE.MeshPhongMaterial({
        color: fruitColor,
        emissive: fruitColor,
        emissiveIntensity: 0.3
    });
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    
    // Random position in tree crown
    const angle = Math.random() * Math.PI * 2;
    const height = 12 + Math.random() * 8; // In the foliage area
    const radius = Math.random() * 6;
    
    fruit.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
    );
    
    // Add fruit data
    fruit.userData = {
        stablecoin: stablecoin,
        amount: amount,
        createdAt: Date.now()
    };
    
    tree.mesh.add(fruit);
    tree.fruits.push(fruit);
    
    // Limit fruits per tree to prevent overcrowding
    if (tree.fruits.length > 20) {
        const oldestFruit = tree.fruits.shift();
        tree.mesh.remove(oldestFruit);
        oldestFruit.geometry.dispose();
        oldestFruit.material.dispose();
    }
}

// Add fruit to a random existing border tree
function addFruitToRandomTree(stablecoin, amount) {
    if (borderTrees.length === 0) return;
    
    const randomTree = borderTrees[Math.floor(Math.random() * borderTrees.length)];
    addFruitToTree(randomTree, stablecoin, amount);
}

// Create new border tree for massive transactions
function createNewBorderTree(stablecoin, amount) {
    // Find a position on the border that's not too close to existing trees
    let attempts = 0;
    let position;
    
    do {
        const angle = Math.random() * Math.PI * 2;
        const radius = GARDEN_RADIUS + Math.random() * 10;
        position = {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            y: -30
        };
        
        attempts++;
    } while (attempts < 20 && isTooCloseToExistingTree(position, 8));
    
    // Create the new tree
    const tree = createBorderTree(position, stablecoin);
    
    // Add extra fruits for the massive transaction
    const fruitCount = Math.min(Math.floor(amount / 5000), 5);
    for (let i = 0; i < fruitCount; i++) {
        addFruitToTree(tree, stablecoin, amount);
    }
    
    borderTrees.push(tree);
    borderTreePositions.push(position);
    scene.add(tree.mesh);
    
    console.log(`Created new border tree for massive transaction: $${amount} ${stablecoin}`);
}

// Check if position is too close to existing trees
function isTooCloseToExistingTree(newPosition, minDistance) {
    return borderTreePositions.some(existingPos => {
        const distance = Math.sqrt(
            Math.pow(newPosition.x - existingPos.x, 2) + 
            Math.pow(newPosition.z - existingPos.z, 2)
        );
        return distance < minDistance;
    });
}

// Create a power-up fruit (life fruit)
function createPowerUpFruit() {
    // Check if we've reached the maximum number of power-up fruits
    if (powerUpFruits.length >= MAX_POWER_UP_FRUITS) {
        console.log('Maximum power-up fruits reached, skipping spawn');
        return;
    }
    
    if (borderTrees.length === 0) return;
    
    // Find a good spawn position that's not too close to existing fruits
    const spawnPosition = findOptimalPowerUpSpawnPosition();
    if (!spawnPosition) {
        console.log('Could not find suitable spawn position for power-up fruit');
        return;
    }
    
    // Create special power-up fruit
    const powerUpGeometry = new THREE.SphereGeometry(1.0, 12, 8);
    const powerUpMaterial = new THREE.MeshPhongMaterial({
        color: 0xFF69B4, // Pink/magenta color for life fruit
        emissive: 0xFF1493,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 1.0
    });
    
    const powerUpFruit = new THREE.Mesh(powerUpGeometry, powerUpMaterial);
    
    // Start position high above the spawn point
    powerUpFruit.position.set(
        spawnPosition.x,
        spawnPosition.y + 20, // Start 20 units above ground
        spawnPosition.z
    );
    
    // Add special properties including physics
    powerUpFruit.userData = {
        isPowerUp: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + POWER_UP_LIFETIME,
        originalEmissiveIntensity: 0.6,
        glowing: false,
        velocity: new THREE.Vector3(0, 0, 0),
        targetGroundY: spawnPosition.y,
        onGround: false,
        bounces: 0
    };
    
    // Add to scene directly (not to tree)
    scene.add(powerUpFruit);
    powerUpFruits.push(powerUpFruit);
    
    console.log('Power-up fruit spawned! It will fall to the ground.');
    
    // Show notification
    showPowerUpNotification();
}

// Find optimal spawn position for power-up fruit
function findOptimalPowerUpSpawnPosition() {
    const maxAttempts = 50;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        // Random position within the garden area
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 50; // Between inner area and border
        
        const candidatePosition = {
            x: Math.cos(angle) * radius,
            y: -29, // Ground level
            z: Math.sin(angle) * radius
        };
        
        // Check distance from existing power-up fruits
        let tooClose = false;
        for (let fruit of powerUpFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < MIN_POWER_UP_DISTANCE) {
                tooClose = true;
                break;
            }
        }
        
        // Check distance from border trees (don't spawn too close)
        for (let tree of borderTrees) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - tree.mesh.position.x, 2) +
                Math.pow(candidatePosition.z - tree.mesh.position.z, 2)
            );
            
            if (distance < 8) { // Too close to tree
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose) {
            return candidatePosition;
        }
        
        attempts++;
    }
    
    return null; // Could not find suitable position
}

// Create a leverage fruit (size doubling fruit)
function createLeverageFruit() {
    // Check if we've reached the maximum number of leverage fruits
    if (leverageFruits.length >= MAX_LEVERAGE_FRUITS) {
        console.log('Maximum leverage fruits reached, skipping spawn');
        return;
    }
    
    // Find a good spawn position
    const spawnPosition = findOptimalLeverageFruitSpawnPosition();
    if (!spawnPosition) {
        console.log('Could not find suitable spawn position for leverage fruit');
        return;
    }
    
    // Create special leverage fruit (different color/style from life fruit)
    const leverageGeometry = new THREE.SphereGeometry(1.2, 16, 12);
    const leverageMaterial = new THREE.MeshPhongMaterial({
        color: 0xFFD700, // Gold color for leverage fruit
        emissive: 0xFF8C00, // Orange glow
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 1.0
    });
    
    const leverageFruit = new THREE.Mesh(leverageGeometry, leverageMaterial);
    
    // Start position high above the spawn point
    leverageFruit.position.set(
        spawnPosition.x,
        spawnPosition.y + 25, // Start higher than life fruits
        spawnPosition.z
    );
    
    // Add special properties
    leverageFruit.userData = {
        isLeverageFruit: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + LEVERAGE_FRUIT_LIFETIME,
        originalEmissiveIntensity: 0.8,
        glowing: false,
        velocity: new THREE.Vector3(0, 0, 0),
        targetGroundY: spawnPosition.y,
        onGround: false,
        bounces: 0
    };
    
    // Add to scene directly
    scene.add(leverageFruit);
    leverageFruits.push(leverageFruit);
    
    console.log('Leverage fruit spawned! Collect it to double your size!');
    
    // Show notification
    showLeverageFruitNotification();
}

// Find optimal spawn position for leverage fruit
function findOptimalLeverageFruitSpawnPosition() {
    const maxAttempts = 50;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        // Random position within the garden area
        const angle = Math.random() * Math.PI * 2;
        const radius = 25 + Math.random() * 45; // Slightly different area from life fruits
        
        const candidatePosition = {
            x: Math.cos(angle) * radius,
            y: -29, // Ground level
            z: Math.sin(angle) * radius
        };
        
        // Check distance from existing leverage fruits
        let tooClose = false;
        for (let fruit of leverageFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < 25) { // Larger minimum distance for leverage fruits
                tooClose = true;
                break;
            }
        }
        
        // Check distance from power-up fruits (don't spawn too close)
        for (let fruit of powerUpFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < 15) {
                tooClose = true;
                break;
            }
        }
        
        // Check distance from border trees
        for (let tree of borderTrees) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - tree.mesh.position.x, 2) +
                Math.pow(candidatePosition.z - tree.mesh.position.z, 2)
            );
            
            if (distance < 10) {
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose) {
            return candidatePosition;
        }
        
        attempts++;
    }
    
    return null;
}

// Show leverage fruit notification
function showLeverageFruitNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: linear-gradient(135deg, #FFD700, #FF8C00);
        color: black;
        padding: 15px 25px;
        border-radius: 10px;
        font-size: 16px;
        font-weight: bold;
        z-index: 1000;
        animation: slideInLeft 0.5s ease-out;
        box-shadow: 0 5px 20px rgba(255, 215, 0, 0.4);
        border: 2px solid #FF8C00;
    `;
    notification.textContent = '⚡ Leverage Fruit Spawned! Double your size!';
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInLeft {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideInLeft 0.5s ease-in reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
                if (style.parentNode) {
                    document.head.removeChild(style);
                }
            }, 500);
        }
    }, 4000);
}

// Show power-up notification
function showPowerUpNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #FF69B4, #FF1493);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-size: 16px;
        font-weight: bold;
        z-index: 1000;
        animation: slideIn 0.5s ease-out;
        box-shadow: 0 5px 20px rgba(255, 105, 180, 0.4);
    `;
    notification.textContent = '💖 Life Fruit Spawned! Find the glowing fruit!';
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideIn 0.5s ease-in reverse';
            setTimeout(() => {
                document.body.removeChild(notification);
                document.head.removeChild(style);
            }, 500);
        }
    }, 4000);
}

// Create a speedrun fruit (speed doubling fruit)
function createSpeedrunFruit() {
    // Check if we've reached the maximum number of speedrun fruits
    if (speedrunFruits.length >= MAX_SPEEDRUN_FRUITS) {
        console.log('Maximum speedrun fruits reached, skipping spawn');
        return;
    }
    
    // Find a good spawn position
    const spawnPosition = findOptimalSpeedrunFruitSpawnPosition();
    if (!spawnPosition) {
        console.log('Could not find suitable spawn position for speedrun fruit');
        return;
    }
    
    // Create special speedrun fruit (electric blue/cyan color for speed)
    const speedrunGeometry = new THREE.SphereGeometry(1.1, 12, 10);
    const speedrunMaterial = new THREE.MeshPhongMaterial({
        color: 0x00FFFF, // Cyan color for speedrun fruit
        emissive: 0x0088FF, // Electric blue glow
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 1.0
    });
    
    const speedrunFruit = new THREE.Mesh(speedrunGeometry, speedrunMaterial);
    
    // Start position high above the spawn point
    speedrunFruit.position.set(
        spawnPosition.x,
        spawnPosition.y + 23, // Start high
        spawnPosition.z
    );
    
    // Add special properties
    speedrunFruit.userData = {
        isSpeedrunFruit: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + SPEEDRUN_FRUIT_LIFETIME,
        originalEmissiveIntensity: 0.9,
        glowing: false,
        velocity: new THREE.Vector3(0, 0, 0),
        targetGroundY: spawnPosition.y,
        onGround: false,
        bounces: 0
    };
    
    // Add to scene directly
    scene.add(speedrunFruit);
    speedrunFruits.push(speedrunFruit);
    
    console.log('Speedrun fruit spawned! Collect it to double your speed!');
    
    // Show notification
    showSpeedrunFruitNotification();
}

// Find optimal spawn position for speedrun fruit
function findOptimalSpeedrunFruitSpawnPosition() {
    const maxAttempts = 50;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        // Random position within the garden area (different area from other fruits)
        const angle = Math.random() * Math.PI * 2;
        const radius = 35 + Math.random() * 40; // Different spawn area
        
        const candidatePosition = {
            x: Math.cos(angle) * radius,
            y: -29, // Ground level
            z: Math.sin(angle) * radius
        };
        
        // Check distance from existing speedrun fruits
        let tooClose = false;
        for (let fruit of speedrunFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < 30) { // Large minimum distance for speedrun fruits
                tooClose = true;
                break;
            }
        }
        
        // Check distance from leverage fruits (don't spawn too close)
        for (let fruit of leverageFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < 20) {
                tooClose = true;
                break;
            }
        }
        
        // Check distance from power-up fruits (don't spawn too close)
        for (let fruit of powerUpFruits) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - fruit.position.x, 2) +
                Math.pow(candidatePosition.z - fruit.position.z, 2)
            );
            
            if (distance < 15) {
                tooClose = true;
                break;
            }
        }
        
        // Check distance from border trees
        for (let tree of borderTrees) {
            const distance = Math.sqrt(
                Math.pow(candidatePosition.x - tree.mesh.position.x, 2) +
                Math.pow(candidatePosition.z - tree.mesh.position.z, 2)
            );
            
            if (distance < 10) {
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose) {
            return candidatePosition;
        }
        
        attempts++;
    }
    
    return null;
}

// Show speedrun fruit notification
function showSpeedrunFruitNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 20px;
        background: linear-gradient(135deg, #00FFFF, #0088FF);
        color: black;
        padding: 15px 25px;
        border-radius: 10px;
        font-size: 16px;
        font-weight: bold;
        z-index: 1000;
        animation: slideInLeft 0.5s ease-out;
        box-shadow: 0 5px 20px rgba(0, 255, 255, 0.4);
        border: 2px solid #0088FF;
    `;
    notification.textContent = '⚡ Speedrun Fruit Spawned! Double your speed!';
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInLeft {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideInLeft 0.5s ease-in reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
                if (style.parentNode) {
                    document.head.removeChild(style);
                }
            }, 500);
        }
    }, 4000);
}

// Update speedrun fruits (physics, expiration, collection)
function updateSpeedrunFruits() {
    const currentTime = Date.now();
    const time = currentTime * 0.001;
    
    for (let i = speedrunFruits.length - 1; i >= 0; i--) {
        const fruit = speedrunFruits[i];
        
        // Check expiration
        if (currentTime > fruit.userData.expiresAt) {
            console.log('Speedrun fruit expired!');
            createSpeedrunExpirationEffect(fruit.position);
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
            speedrunFruits.splice(i, 1);
            continue;
        }
        
        // Update physics if not on ground
        if (!fruit.userData.onGround) {
            // Apply gravity
            fruit.userData.velocity.y -= 0.5;
            
            // Apply velocity
            fruit.position.add(fruit.userData.velocity);
            
            // Check ground collision
            if (fruit.position.y <= fruit.userData.targetGroundY) {
                fruit.position.y = fruit.userData.targetGroundY;
                
                // Bounce effect
                if (fruit.userData.bounces < 2) {
                    fruit.userData.velocity.y = Math.abs(fruit.userData.velocity.y) * 0.4;
                    fruit.userData.bounces++;
                } else {
                    fruit.userData.velocity.y = 0;
                    fruit.userData.onGround = true;
                    console.log('Speedrun fruit landed on ground');
                }
            }
        }
        
        // Special electric blue glowing effects for speedrun fruit
        const timeRemaining = fruit.userData.expiresAt - currentTime;
        const urgencyFactor = 1 - (timeRemaining / SPEEDRUN_FRUIT_LIFETIME);
        
        if (playerControls.mesh && playerControls.isPlaying) {
            const distance = playerControls.mesh.position.distanceTo(fruit.position);
            
            // Base electric blue glow that increases as expiration approaches
            let baseIntensity = fruit.userData.originalEmissiveIntensity + urgencyFactor * 0.5;
            
            // Enhanced electric glow when player is near
            if (distance < POWER_UP_GLOW_RADIUS) {
                if (!fruit.userData.glowing) {
                    fruit.userData.glowing = true;
                    console.log('Speedrun fruit is glowing - speed boost awaits!');
                }
                
                // Intense electric pulsing glow
                const intensity = baseIntensity + Math.sin(time * 12) * 0.6;
                fruit.material.emissiveIntensity = Math.min(intensity, 1.6);
                
                // Scale pulsing with electric effect
                const scale = 1.05 + Math.sin(time * 10) * 0.35;
                fruit.scale.setScalar(scale);
                
            } else {
                if (fruit.userData.glowing) {
                    fruit.userData.glowing = false;
                }
                
                // Normal electric glow with urgency
                const intensity = baseIntensity + Math.sin(time * 4) * 0.25;
                fruit.material.emissiveIntensity = intensity;
                
                // Gentle scale animation
                const scale = 1.0 + Math.sin(time * 5) * 0.12;
                fruit.scale.setScalar(scale);
            }
            
            // Urgent electric flashing when about to expire (last 8 seconds)
            if (timeRemaining < 8000) {
                const flashRate = Math.max(0.2, timeRemaining / 8000);
                const flash = Math.sin(time * (15 / flashRate)) > 0 ? 2.2 : 0.3;
                fruit.material.emissiveIntensity = flash;
                
                // Urgent scaling with electric intensity
                const urgentScale = 1.4 + Math.sin(time * 12) * 0.6;
                fruit.scale.setScalar(urgentScale);
            }
        }
        
        // Gentle floating animation when on ground with electric sparkle
        if (fruit.userData.onGround) {
            fruit.position.y = fruit.userData.targetGroundY + Math.sin(time * 4 + fruit.userData.createdAt * 0.001) * 0.6;
            
            // Add rapid rotation for electric energy effect
            fruit.rotation.y += 0.05;
            fruit.rotation.x += 0.02;
        }
    }
}

// Create expiration effect when speedrun fruit disappears
function createSpeedrunExpirationEffect(position) {
    const effectGroup = new THREE.Group();
    effectGroup.position.copy(position);
    
    // Create electric blue lightning particles
    for (let i = 0; i < 18; i++) {
        const lightningGeometry = new THREE.CylinderGeometry(0.1, 0.3, 1.2, 6);
        const lightningMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            emissive: 0x0088FF,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.95
        });
        const lightning = new THREE.Mesh(lightningGeometry, lightningMaterial);
        
        lightning.position.set(
            (Math.random() - 0.5) * 5,
            Math.random() * 3.5,
            (Math.random() - 0.5) * 5
        );
        
        // Random rotation for lightning effect
        lightning.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        effectGroup.add(lightning);
    }
    
    scene.add(effectGroup);
    
    // Animate the electric expiration effect
    let animationTime = 0;
    const animateExpiration = () => {
        animationTime += 0.03;
        
        effectGroup.children.forEach((lightning) => {
            lightning.position.y += 0.5;
            lightning.material.opacity -= 0.03;
            lightning.material.emissiveIntensity -= 0.04;
            lightning.rotation.y += 0.4;
            lightning.scale.multiplyScalar(0.98);
        });
        
        if (animationTime < 1.0 && effectGroup.children.length > 0) {
            requestAnimationFrame(animateExpiration);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateExpiration();
}

// Collect speedrun fruit and apply speed effect
function collectSpeedrunFruit(fruit, index) {
    const currentTime = Date.now();
    
    // Check if this is within the double-eat window
    let speedMultiplier = 2.0;
    if (currentTime - lastSpeedrunFruitEaten <= SPEEDRUN_DOUBLE_EAT_WINDOW && speedrunEaten === 1) {
        speedMultiplier = 4.0;
        speedrunEaten = 2;
        console.log('DOUBLE EAT! 4x speed boost activated!');
    } else {
        speedrunEaten = 1;
        console.log('Speedrun fruit collected! 2x speed boost activated!');
    }
    
    // Store original speed if this is the first speedrun effect
    if (!speedrunActive) {
        originalPlayerSpeed = 20; // Base speed is now 20
    }
    
    // Apply speed multiplier
    playerControls.speed = 20 * speedMultiplier; // Always multiply from base speed
    
    // Set speedrun state
    speedrunActive = true;
    lastSpeedrunFruitEaten = currentTime;
    
    // Clear any existing timer
    if (speedrunEffectTimer) {
        clearTimeout(speedrunEffectTimer);
    }
    
    // Set timer to reset speed after effect duration
    speedrunEffectTimer = setTimeout(() => {
        resetSpeedrunEffect();
    }, SPEEDRUN_EFFECT_DURATION);
    
    // Remove fruit from scene and arrays
    scene.remove(fruit);
    fruit.geometry.dispose();
    fruit.material.dispose();
    speedrunFruits.splice(index, 1);
    
    // Show collection effect
    showSpeedrunCollectionEffect(fruit.position, speedMultiplier);
    
    // Flash screen cyan
    flashScreen(0x00FFFF, 180);
    
    console.log(`Player speed increased to ${playerControls.speed.toFixed(1)} (${speedMultiplier}x boost)`);
}

// Reset speedrun effect back to normal speed
function resetSpeedrunEffect() {
    if (speedrunActive) {
        playerControls.speed = 20; // Reset to base speed
        
        speedrunActive = false;
        speedrunEaten = 0;
        speedrunEffectTimer = null;
        
        console.log(`Speedrun effect expired. Player speed reset to ${playerControls.speed.toFixed(1)}`);
    }
}

// Check if difficulty should scale up based on animal threat levels
function checkDifficultyScaling() {
    const currentTime = Date.now();
    
    // Only check every few seconds to avoid performance impact
    if (currentTime - lastDifficultyCheck < DIFFICULTY_CHECK_INTERVAL) {
        return;
    }
    lastDifficultyCheck = currentTime;
    
    // Skip if not enough animals to make a meaningful calculation
    if (animals.length < 5) {
        return;
    }
    
    // Calculate how many animals are edible vs threatening
    let edibleCount = 0;
    let threateningCount = 0;
    let largestAnimalSize = 0;
    
    animals.forEach(animal => {
        if (animal.size < playerControls.size * 1.2) {
            edibleCount++;
        } else {
            threateningCount++;
        }
        largestAnimalSize = Math.max(largestAnimalSize, animal.size);
    });
    
    const edibleRatio = edibleCount / animals.length;
    const smallerRatio = animals.filter(a => a.size < playerControls.size).length / animals.length;
    
    // ALLIANCE MODE - Player is too dominant (90%+ animals are smaller)
    if (smallerRatio >= ALLIANCE_THRESHOLD && largestAnimalSize < playerControls.size * 0.8) {
        if (difficultyLevel !== 'alliance') {
            difficultyLevel = 'alliance';
            allianceActive = true;
            console.log(`⚔️ ALLIANCE MODE ACTIVATED! You're too powerful (${(smallerRatio * 100).toFixed(1)}% smaller). Animals will team up against you!`);
            console.log(`   Player size: ${playerControls.size.toFixed(1)}, Largest animal: ${largestAnimalSize.toFixed(1)}, Total animals: ${animals.length}`);
            
            // Start the alliance behavior immediately and aggressively
            initiateAnimalAlliance();
            
            // If extremely dominant, start multiple alliance waves immediately
            const sizeGapFactor = playerControls.size / Math.max(largestAnimalSize, 1);
            if (sizeGapFactor > 3) {
                setTimeout(() => initiateAnimalAlliance(), 50);
                if (sizeGapFactor > 4) {
                    setTimeout(() => initiateAnimalAlliance(), 100);
                }
                if (sizeGapFactor > 5) {
                    setTimeout(() => initiateAnimalAlliance(), 150);
                }
            }
        }
    }
    // Exit alliance mode if there are now competitive animals
    else if (difficultyLevel === 'alliance' && (smallerRatio < ALLIANCE_THRESHOLD * 0.8 || largestAnimalSize > playerControls.size * 0.9)) {
        difficultyLevel = 'survival';
        allianceActive = false;
        console.log(`⚔️ Alliance mode ended. Competitive balance restored.`);
        
        // Clean up any animals still in merging state
        animals.forEach(animal => {
            if (animal.aiState === 'merging') {
                animal.aiState = 'roaming';
                animal.mergePartner = null;
                animal.hasMerged = false;
                console.log(`🔄 Reset ${animal.animalType} from merging to roaming`);
            }
        });
    }
    // SURVIVAL MODE - Moderate dominance (50-90% edible)
    else if (edibleRatio > EDIBLE_THRESHOLD && difficultyLevel === 'normal') {
        difficultyLevel = 'survival';
        console.log(`🔥 SURVIVAL MODE ACTIVATED! ${(edibleRatio * 100).toFixed(1)}% of animals are now edible. Animals will start eating each other to grow!`);
        
        // Initialize hunting behavior for some animals
        let huntersCreated = 0;
        animals.forEach(animal => {
            if (Math.random() < 0.3) { // 30% chance to become hunters initially
                animal.aiState = 'hunting';
                animal.huntingCooldown = Date.now() - 1000; // Allow immediate hunting
                huntersCreated++;
            }
        });
        console.log(`👹 ${huntersCreated} animals became hunters!`);
    }
    // NORMAL MODE - Balanced gameplay
    else if (edibleRatio < EDIBLE_THRESHOLD * 0.7 && difficultyLevel === 'survival') {
        difficultyLevel = 'normal';
        console.log(`✅ Difficulty normalized. ${(edibleRatio * 100).toFixed(1)}% animals edible.`);
        
        // Reset all animals to roaming state
        animals.forEach(animal => {
            animal.aiState = 'roaming';
            animal.targetAnimal = null;
            animal.huntingCooldown = 0;
        });
    }
}

// Handle animal eating another animal (survival mode behavior)
function animalEatAnimal(predator, prey) {
    // Clean up merge partner if prey was merging
    if (prey.mergePartner && prey.mergePartner.isAlive) {
        console.log(`🔓 Freeing ${prey.mergePartner.animalType} from broken merge (partner eaten by ${predator.animalType})`);
        prey.mergePartner.aiState = 'roaming';
        prey.mergePartner.mergePartner = null;
        prey.mergePartner.hasMerged = false;
    }
    
    // Mark prey as not alive
    prey.isAlive = false;
    
    // Calculate growth from eating
    const growthFactor = Math.log10(prey.amount + 1) * 0.15; // Slightly more growth than player eating
    predator.size = Math.min(predator.size + growthFactor, 8); // Max animal size of 8
    predator.growthFromEating += growthFactor;
    
    // Update predator's mesh scale
    predator.mesh.scale.setScalar(predator.size / predator.originalSize);
    
    // Update predator's value proportionally to size increase
    predator.amount = Math.min(predator.amount * 1.2, 50000); // Cap at 50k value
    
    // Visual feedback
    flashAnimalEatingEffect(predator.mesh.position, prey.baseColor);
    
    // Remove prey from the world
    scene.remove(prey.mesh);
    prey.dispose();
    const preyIndex = animals.indexOf(prey);
    if (preyIndex !== -1) {
        animals.splice(preyIndex, 1);
        stats.currentAnimals--;
    }
    
    // Set predator to growing state briefly
    predator.aiState = 'growing';
    predator.targetAnimal = null;
    
    // Return to hunting after a brief pause
    setTimeout(() => {
        if (predator.isAlive && difficultyLevel === 'survival') {
            predator.aiState = 'roaming';
            predator.huntingCooldown = Date.now() + 3000 + Math.random() * 2000; // 3-5 second cooldown
        }
    }, 1000);
    
    console.log(`🍖 ${predator.animalType} ate ${prey.animalType}! Size: ${predator.originalSize.toFixed(1)} → ${predator.size.toFixed(1)} (+${growthFactor.toFixed(2)})`);
}

// Initiate animal alliance - animals team up against dominant player
function initiateAnimalAlliance() {
    if (animals.length < 2) {
        console.log('⚠️ Not enough animals for alliance');
        return;
    }
    
    // Filter out animals already in merging state
    const availableAnimals = animals.filter(a => a.aiState !== 'merging');
    
    if (availableAnimals.length < 2) {
        console.log(`⚠️ Not enough available animals for new alliance (${availableAnimals.length} available, ${animals.length - availableAnimals.length} already merging)`);
        return;
    }
    
    // Calculate how desperate the alliance should be
    const smallerRatio = animals.filter(a => a.size < playerControls.size).length / animals.length;
    const largestAnimalSize = Math.max(...animals.map(a => a.size), 0);
    const dominanceFactor = playerControls.size / Math.max(largestAnimalSize, 1);
    
    // Sort available animals by size (largest first)
    const sortedAnimals = [...availableAnimals].sort((a, b) => b.size - a.size);
    
    console.log(`🔍 Checking ${sortedAnimals.length} available animals for alliance (dominance: ${dominanceFactor.toFixed(1)}x larger than biggest animal)...`);
    
    // Find pairs of animals to merge
    const mergePairs = [];
    const alreadyPaired = new Set();
    
    // Ultra-aggressive pairing when player is extremely dominant
    const maxPairs = dominanceFactor > 5 ? 10 : dominanceFactor > 4 ? 8 : dominanceFactor > 3 ? 6 : dominanceFactor > 2 ? 5 : dominanceFactor > 1.5 ? 4 : 3;
    const sizeThreshold = dominanceFactor > 3 ? 0.1 : Math.max(0.2, 0.5 / Math.sqrt(dominanceFactor)); // Extremely low threshold in panic
    const mergeFactor = dominanceFactor > 3 ? 1.0 : dominanceFactor > 2 ? 0.9 : 0.7; // Full size contribution in panic
    
    console.log(`🎯 Alliance aggressiveness: ${maxPairs} max pairs, ${(sizeThreshold * 100).toFixed(0)}% size threshold`);
    
    // Pair similar-sized animals, starting with the largest
    // This creates more effective merged animals
    for (let i = 0; i < sortedAnimals.length - 1; i++) {
        if (alreadyPaired.has(sortedAnimals[i])) continue;
        
        const animal1 = sortedAnimals[i];
        let bestPartner = null;
        let bestScore = -1;
        
        // Look for the best partner (similar size preferred)
        for (let j = i + 1; j < Math.min(i + 10, sortedAnimals.length); j++) {
            if (alreadyPaired.has(sortedAnimals[j])) continue;
            
            const animal2 = sortedAnimals[j];
            
            // Calculate size ratio (closer to 1.0 is better)
            const sizeRatio = animal2.size / animal1.size;
            const similarityScore = 1 - Math.abs(1 - sizeRatio); // 1.0 when equal, 0 when very different
            
            // Calculate combined effectiveness
            const combinedSize = animal1.size + animal2.size * mergeFactor;
            const effectiveness = combinedSize / playerControls.size;
            
            // Score based on both similarity and effectiveness
            // Prioritize similar sizes for better merges
            const score = similarityScore * 0.7 + effectiveness * 0.3;
            
            // Only consider if meets minimum threshold
            if (combinedSize > playerControls.size * sizeThreshold && score > bestScore) {
                bestPartner = animal2;
                bestScore = score;
            }
        }
        
        // Pair with best partner if found
        if (bestPartner) {
            const combinedSize = animal1.size + bestPartner.size * mergeFactor;
            
            mergePairs.push([animal1, bestPartner]);
            alreadyPaired.add(animal1);
            alreadyPaired.add(bestPartner);
            
            // Set their AI states to seek merging
            animal1.aiState = 'merging';
            animal1.mergePartner = bestPartner;
            animal1.behaviorState = 'wandering';
            
            bestPartner.aiState = 'merging';
            bestPartner.mergePartner = animal1;
            bestPartner.behaviorState = 'wandering';
            
            console.log(`💑 Pairing ${animal1.animalType} (${animal1.size.toFixed(1)}) with ${bestPartner.animalType} (${bestPartner.size.toFixed(1)}) → Combined: ${combinedSize.toFixed(1)} (ratio: ${(bestPartner.size/animal1.size).toFixed(2)})`);
            
            if (mergePairs.length >= maxPairs) break;
        }
    }
    
    if (mergePairs.length === 0) {
        console.log('⚠️ No suitable pairs found - forcing aggressive merges!');
        // When extremely dominant, force merge the largest animals
        const forcePairs = Math.min(Math.floor(sortedAnimals.length / 2), dominanceFactor > 2 ? 4 : 2);
        
        // Pair largest with second-largest, third with fourth, etc.
        for (let i = 0; i < forcePairs && i * 2 < sortedAnimals.length - 1; i++) {
            const animal1 = sortedAnimals[i * 2];
            const animal2 = sortedAnimals[i * 2 + 1];
            
            if (animal1 && animal2 && !alreadyPaired.has(animal1) && !alreadyPaired.has(animal2)) {
                animal1.aiState = 'merging';
                animal1.mergePartner = animal2;
                animal2.aiState = 'merging';
                animal2.mergePartner = animal1;
                
                alreadyPaired.add(animal1);
                alreadyPaired.add(animal2);
                
                const combinedSize = animal1.size + animal2.size * 0.9;
                console.log(`🔴 FORCED PAIRING: ${animal1.animalType} (${animal1.size.toFixed(1)}) + ${animal2.animalType} (${animal2.size.toFixed(1)}) = ${combinedSize.toFixed(1)}`);
                mergePairs.push([animal1, animal2]);
            }
        }
    }
    
    console.log(`🤝 ${mergePairs.length} animal pairs forming alliances to challenge you!`);
}

// Handle animal merging during alliance mode
function mergeAnimals(animal1, animal2) {
    if (!animal1.isAlive || !animal2.isAlive) return;
    
    // The larger animal absorbs the smaller one
    const absorber = animal1.size >= animal2.size ? animal1 : animal2;
    const absorbed = animal1.size < animal2.size ? animal1 : animal2;
    
    // More aggressive size gains when player is extremely dominant
    const dominanceFactor = playerControls.size / Math.max(absorber.size, absorbed.size, 1);
    const sizeFactor = dominanceFactor > 2 ? 0.9 : dominanceFactor > 1.5 ? 0.8 : 0.7;
    
    // Higher size cap when player is very dominant
    const sizeCap = dominanceFactor > 3 ? 2.0 : dominanceFactor > 2 ? 1.7 : 1.5;
    const newSize = Math.min(absorber.size + absorbed.size * sizeFactor, playerControls.size * sizeCap);
    
    // Update the absorber
    absorber.size = newSize;
    absorber.amount = absorber.amount + absorbed.amount * 0.5; // Combine values
    absorber.mesh.scale.setScalar(newSize / absorber.originalSize);
    
    // Create merge visual effect
    createMergeEffect(absorber.mesh.position, absorbed.mesh.position, absorber.baseColor, absorbed.baseColor);
    
    // Remove the absorbed animal
    scene.remove(absorbed.mesh);
    absorbed.dispose();
    const index = animals.indexOf(absorbed);
    if (index !== -1) {
        animals.splice(index, 1);
        stats.currentAnimals--;
    }
    
    // Reset absorber's state
    absorber.aiState = 'roaming';
    absorber.mergePartner = null;
    absorber.hasMerged = false; // Reset merge flag
    
    console.log(`🔮 Alliance formed! ${absorber.animalType} absorbed ${absorbed.animalType}. New size: ${newSize.toFixed(1)} (vs player: ${playerControls.size.toFixed(1)})`);
    
    // Check if we need more merges
    if (allianceActive) {
        checkAllianceProgress();
    }
}

// Check if alliance has created enough competitive animals
function checkAllianceProgress() {
    const competitiveAnimals = animals.filter(a => a.size > playerControls.size * 0.8).length;
    const smallerRatio = animals.filter(a => a.size < playerControls.size).length / animals.length;
    
    // Calculate dominance factor (how overpowered the player is)
    const dominanceFactor = Math.min(smallerRatio / ALLIANCE_THRESHOLD, 1.2); // 1.0 at 90%, up to 1.2 at 100%
    const largestAnimalSize = Math.max(...animals.map(a => a.size), 0);
    const sizeGapFactor = playerControls.size / Math.max(largestAnimalSize, 1); // How much bigger player is than largest animal
    
    // More aggressive merging when player is extremely dominant
    const aggressiveness = dominanceFactor * Math.min(sizeGapFactor / 2, 2); // Scale up to 2x aggressive
    
    // Need more competitive animals when player is very dominant
    const requiredCompetitors = sizeGapFactor > 3 ? 3 : 2;
    
    if (competitiveAnimals >= requiredCompetitors) {
        allianceActive = false;
        console.log(`⚔️ Alliance successful! ${competitiveAnimals} animals can now challenge you.`);
        
        // Clean up any remaining merge states
        animals.forEach(animal => {
            if (animal.aiState === 'merging') {
                animal.aiState = 'roaming';
                animal.mergePartner = null;
                animal.hasMerged = false;
            }
        });
    } else if (allianceActive && animals.length > 2) {
        // Ultra-aggressive timing for extreme dominance
        let adjustedDelay;
        
        if (sizeGapFactor > 5) {
            // You're 5x+ bigger than largest animal - PANIC MODE
            adjustedDelay = 100; // Near instant merging!
        } else if (sizeGapFactor > 4) {
            // 4x bigger - extremely aggressive
            adjustedDelay = 200;
        } else if (sizeGapFactor > 3) {
            // 3x bigger - very aggressive
            adjustedDelay = 400;
        } else if (sizeGapFactor > 2) {
            // 2x bigger - aggressive
            adjustedDelay = 800;
        } else {
            // Standard aggressive timing
            const baseDelay = 3000;
            adjustedDelay = Math.max(1000, baseDelay / aggressiveness);
        }
        
        console.log(`⏰ Next alliance in ${(adjustedDelay/1000).toFixed(1)}s (${sizeGapFactor.toFixed(1)}x bigger than largest, ${(smallerRatio*100).toFixed(0)}% smaller)`);
        
        setTimeout(() => {
            if (allianceActive) {
                initiateAnimalAlliance();
            }
        }, adjustedDelay);
    }
}

// Create visual effect for animal merging
function createMergeEffect(position1, position2, color1, color2) {
    // Create energy beam between the two animals
    const midPoint = new THREE.Vector3().lerpVectors(position1, position2, 0.5);
    
    // Create expanding ring effect
    const ringGeometry = new THREE.RingGeometry(0.5, 2, 8);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color1).lerp(new THREE.Color(color2), 0.5),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(midPoint);
    ring.position.y = -28;
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    
    // Animate the ring
    const animateRing = () => {
        ring.scale.x += 0.3;
        ring.scale.y += 0.3;
        ringMaterial.opacity -= 0.02;
        
        if (ringMaterial.opacity > 0) {
            requestAnimationFrame(animateRing);
        } else {
            scene.remove(ring);
            ringGeometry.dispose();
            ringMaterial.dispose();
        }
    };
    animateRing();
    
    // Create particle burst
    for (let i = 0; i < 20; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.2, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.5 ? color1 : color2,
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(midPoint);
        particle.position.x += (Math.random() - 0.5) * 2;
        particle.position.z += (Math.random() - 0.5) * 2;
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 0.5 + 0.2,
            (Math.random() - 0.5) * 0.5
        );
        
        scene.add(particle);
        
        // Animate particle
        const animateParticle = () => {
            particle.position.add(velocity);
            velocity.y -= 0.02;
            particleMaterial.opacity -= 0.015;
            
            if (particleMaterial.opacity > 0 && particle.position.y > -30) {
                requestAnimationFrame(animateParticle);
            } else {
                scene.remove(particle);
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        };
        animateParticle();
    }
}

// Visual effect for animal eating animal
function flashAnimalEatingEffect(position, color) {
    // Create a brief flash effect at the eating position
    const flashGeometry = new THREE.SphereGeometry(2, 6, 4);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    scene.add(flash);
    
    // Animate and remove the flash
    let scale = 0.1;
    const animate = () => {
        scale += 0.3;
        flash.scale.setScalar(scale);
        flashMaterial.opacity = Math.max(0, 1 - scale / 3);
        
        if (scale < 3) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(flash);
            flash.geometry.dispose();
            flash.material.dispose();
        }
    };
    animate();
}

// Show speedrun collection visual effect
function showSpeedrunCollectionEffect(position, multiplier) {
    const effectGroup = new THREE.Group();
    
    // Create electric lightning bolt particles
    const particleCount = multiplier === 4.0 ? 16 : 10; // More particles for 4x effect
    for (let i = 0; i < particleCount; i++) {
        const boltGeometry = new THREE.CylinderGeometry(0.2, 0.1, 1.5, 6);
        const boltMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            emissive: 0x0088FF,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9
        });
        const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
        
        bolt.position.set(
            (Math.random() - 0.5) * 4,
            Math.random() * 2.5 + 1,
            (Math.random() - 0.5) * 4
        );
        
        // Random rotation for electric effect
        bolt.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        effectGroup.add(bolt);
    }
    
    effectGroup.position.copy(position);
    scene.add(effectGroup);
    
    // Animate the speedrun collection effect
    let animationTime = 0;
    const animateCollection = () => {
        animationTime += 0.05;
        
        effectGroup.children.forEach((bolt) => {
            bolt.position.y += 0.6;
            bolt.material.opacity -= 0.05;
            bolt.rotation.y += 0.5;
            bolt.rotation.x += 0.3;
            bolt.scale.multiplyScalar(multiplier === 4.0 ? 1.03 : 1.015); // Grow faster for 4x effect
        });
        
        if (animationTime < 0.9 && effectGroup.children.length > 0) {
            requestAnimationFrame(animateCollection);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateCollection();
}

// Update power-up fruits (physics, expiration, glowing effects)
function updatePowerUpFruits() {
    const currentTime = Date.now();
    const time = currentTime * 0.001;
    
    // Remove expired fruits first
    for (let i = powerUpFruits.length - 1; i >= 0; i--) {
        const fruit = powerUpFruits[i];
        
        if (currentTime > fruit.userData.expiresAt) {
            // Create expiration effect
            createExpirationEffect(fruit.position);
            
            // Remove fruit
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
            powerUpFruits.splice(i, 1);
            
            console.log('Power-up fruit expired and disappeared');
            continue;
        }
        
        // Update physics if not on ground
        if (!fruit.userData.onGround) {
            // Apply gravity
            fruit.userData.velocity.y -= 0.5;
            
            // Apply velocity
            fruit.position.add(fruit.userData.velocity);
            
            // Check ground collision
            if (fruit.position.y <= fruit.userData.targetGroundY) {
                fruit.position.y = fruit.userData.targetGroundY;
                
                // Bounce effect
                if (fruit.userData.bounces < 2) {
                    fruit.userData.velocity.y = Math.abs(fruit.userData.velocity.y) * 0.4; // Bounce with dampening
                    fruit.userData.bounces++;
                } else {
                    fruit.userData.velocity.y = 0;
                    fruit.userData.onGround = true;
                    console.log('Power-up fruit landed on ground');
                }
            }
        }
        
        // Glowing effects based on proximity and time remaining
        const timeRemaining = fruit.userData.expiresAt - currentTime;
        const urgencyFactor = 1 - (timeRemaining / POWER_UP_LIFETIME); // 0 to 1 as it expires
        
        if (playerControls.mesh && playerControls.isPlaying) {
            const distance = playerControls.mesh.position.distanceTo(fruit.position);
            
            // Base glow that increases as expiration approaches
            let baseIntensity = fruit.userData.originalEmissiveIntensity + urgencyFactor * 0.4;
            
            // Glow when player is near
            if (distance < POWER_UP_GLOW_RADIUS) {
                if (!fruit.userData.glowing) {
                    fruit.userData.glowing = true;
                    console.log('Power-up fruit is glowing - you\'re close!');
                }
                
                // Intense pulsing glow
                const intensity = baseIntensity + Math.sin(time * 8) * 0.5;
                fruit.material.emissiveIntensity = Math.min(intensity, 1.2);
                
                // Scale pulsing
                const scale = 1.0 + Math.sin(time * 6) * 0.3;
                fruit.scale.setScalar(scale);
                
            } else {
                if (fruit.userData.glowing) {
                    fruit.userData.glowing = false;
                }
                
                // Normal glow with urgency
                const intensity = baseIntensity + Math.sin(time * 2) * 0.2;
                fruit.material.emissiveIntensity = intensity;
                
                // Gentle scale animation
                const scale = 1.0 + Math.sin(time * 3) * 0.1;
                fruit.scale.setScalar(scale);
            }
            
            // Urgent flashing when about to expire (last 5 seconds)
            if (timeRemaining < 5000) {
                const flashRate = Math.max(0.5, timeRemaining / 5000); // Faster flash as time runs out
                const flash = Math.sin(time * (10 / flashRate)) > 0 ? 1.5 : 0.3;
                fruit.material.emissiveIntensity = flash;
                
                // Urgent scaling
                const urgentScale = 1.2 + Math.sin(time * 8) * 0.4;
                fruit.scale.setScalar(urgentScale);
            }
        }
        
        // Gentle floating animation when on ground
        if (fruit.userData.onGround) {
            fruit.position.y = fruit.userData.targetGroundY + Math.sin(time * 2 + fruit.userData.createdAt * 0.001) * 0.5;
        }
    }
}

// Update leverage fruits (physics, expiration, collection)
function updateLeverageFruits() {
    const currentTime = Date.now();
    const time = currentTime * 0.001;
    
    for (let i = leverageFruits.length - 1; i >= 0; i--) {
        const fruit = leverageFruits[i];
        
        // Check expiration
        if (currentTime > fruit.userData.expiresAt) {
            console.log('Leverage fruit expired!');
            createLeverageExpirationEffect(fruit.position);
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
            leverageFruits.splice(i, 1);
            continue;
        }
        
        // Update physics if not on ground
        if (!fruit.userData.onGround) {
            // Apply gravity
            fruit.userData.velocity.y -= 0.5;
            
            // Apply velocity
            fruit.position.add(fruit.userData.velocity);
            
            // Check ground collision
            if (fruit.position.y <= fruit.userData.targetGroundY) {
                fruit.position.y = fruit.userData.targetGroundY;
                
                // Bounce effect
                if (fruit.userData.bounces < 2) {
                    fruit.userData.velocity.y = Math.abs(fruit.userData.velocity.y) * 0.4;
                    fruit.userData.bounces++;
                } else {
                    fruit.userData.velocity.y = 0;
                    fruit.userData.onGround = true;
                    console.log('Leverage fruit landed on ground');
                }
            }
        }
        
        // Special golden glowing effects for leverage fruit
        const timeRemaining = fruit.userData.expiresAt - currentTime;
        const urgencyFactor = 1 - (timeRemaining / LEVERAGE_FRUIT_LIFETIME);
        
        if (playerControls.mesh && playerControls.isPlaying) {
            const distance = playerControls.mesh.position.distanceTo(fruit.position);
            
            // Base gold glow that increases as expiration approaches
            let baseIntensity = fruit.userData.originalEmissiveIntensity + urgencyFactor * 0.6;
            
            // Enhanced glow when player is near
            if (distance < POWER_UP_GLOW_RADIUS) {
                if (!fruit.userData.glowing) {
                    fruit.userData.glowing = true;
                    console.log('Leverage fruit is glowing - double your size awaits!');
                }
                
                // Intense golden pulsing glow
                const intensity = baseIntensity + Math.sin(time * 10) * 0.7;
                fruit.material.emissiveIntensity = Math.min(intensity, 1.5);
                
                // Scale pulsing with golden effect
                const scale = 1.1 + Math.sin(time * 8) * 0.4;
                fruit.scale.setScalar(scale);
                
            } else {
                if (fruit.userData.glowing) {
                    fruit.userData.glowing = false;
                }
                
                // Normal golden glow with urgency
                const intensity = baseIntensity + Math.sin(time * 3) * 0.3;
                fruit.material.emissiveIntensity = intensity;
                
                // Gentle scale animation
                const scale = 1.0 + Math.sin(time * 4) * 0.15;
                fruit.scale.setScalar(scale);
            }
            
            // Urgent golden flashing when about to expire (last 10 seconds)
            if (timeRemaining < 10000) {
                const flashRate = Math.max(0.3, timeRemaining / 10000);
                const flash = Math.sin(time * (12 / flashRate)) > 0 ? 2.0 : 0.4;
                fruit.material.emissiveIntensity = flash;
                
                // Urgent scaling with golden intensity
                const urgentScale = 1.3 + Math.sin(time * 10) * 0.5;
                fruit.scale.setScalar(urgentScale);
            }
        }
        
        // Gentle floating animation when on ground with golden sparkle
        if (fruit.userData.onGround) {
            fruit.position.y = fruit.userData.targetGroundY + Math.sin(time * 3 + fruit.userData.createdAt * 0.001) * 0.7;
            
            // Add subtle rotation for extra visual appeal
            fruit.rotation.y += 0.02;
        }
    }
}

// Create expiration effect when leverage fruit disappears
function createLeverageExpirationEffect(position) {
    const effectGroup = new THREE.Group();
    effectGroup.position.copy(position);
    
    // Create golden sparkle particles
    for (let i = 0; i < 15; i++) {
        const sparkleGeometry = new THREE.SphereGeometry(0.3, 6, 6);
        const sparkleMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            emissive: 0xFF8C00,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.9
        });
        const sparkle = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
        
        sparkle.position.set(
            (Math.random() - 0.5) * 4,
            Math.random() * 3,
            (Math.random() - 0.5) * 4
        );
        
        effectGroup.add(sparkle);
    }
    
    scene.add(effectGroup);
    
    // Animate the golden expiration effect
    let animationTime = 0;
    const animateExpiration = () => {
        animationTime += 0.025;
        
        effectGroup.children.forEach((sparkle, index) => {
            sparkle.position.y += 0.4;
            sparkle.material.opacity -= 0.025;
            sparkle.material.emissiveIntensity -= 0.03;
            sparkle.rotation.y += 0.3;
            sparkle.scale.multiplyScalar(0.985);
        });
        
        if (animationTime < 1.2 && effectGroup.children.length > 0) {
            requestAnimationFrame(animateExpiration);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateExpiration();
}

// Create expiration effect when fruit disappears
function createExpirationEffect(position) {
    const effectGroup = new THREE.Group();
    effectGroup.position.copy(position);
    
    // Create sparkle particles
    for (let i = 0; i < 12; i++) {
        const sparkleGeometry = new THREE.SphereGeometry(0.2, 4, 4);
        const sparkleMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF69B4,
            transparent: true,
            opacity: 0.8
        });
        const sparkle = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
        
        sparkle.position.set(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3
        );
        
        effectGroup.add(sparkle);
    }
    
    scene.add(effectGroup);
    
    // Animate the expiration effect
    let animationTime = 0;
    const animateExpiration = () => {
        animationTime += 0.03;
        
        effectGroup.children.forEach((sparkle, index) => {
            sparkle.position.y += 0.3;
            sparkle.material.opacity -= 0.03;
            sparkle.rotation.y += 0.2;
            sparkle.scale.multiplyScalar(0.98);
        });
        
        if (animationTime < 1 && effectGroup.children.length > 0) {
            requestAnimationFrame(animateExpiration);
        } else {
            scene.remove(effectGroup);
            effectGroup.children.forEach(child => {
                child.geometry.dispose();
                child.material.dispose();
            });
        }
    };
    
    animateExpiration();
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Add a new transaction - animals + fruits on trees
function addTransaction(data) {
    const amount = parseFloat(data.amount);
    
    // Add to transaction feed
    addToTransactionFeed(data);
    
    // Track volume
    if (data.stablecoin === 'USDC') totalVolumeUSDC += amount;
    else if (data.stablecoin === 'USDT') totalVolumeUSDT += amount;
    else if (data.stablecoin === 'DAI') totalVolumeDAI += amount;
    
    // Store stablecoin info on the animal
    const stablecoin = data.stablecoin;
    
    // Check if we've reached the entity cap for animals
    if (animals.length >= MAX_PLANTS * 0.9) {
        // Remove oldest animals to make room
        removeOldestAnimals(Math.min(REMOVE_BATCH_SIZE, animals.length));
    }
    
    // Always create animal for transaction
    const animal = new TransactionAnimal(
        data.stablecoin,
        data.amount,
        data.from,
        data.to
    );
    
    // Store the stablecoin type on the animal for field display
    animal.stablecoin = stablecoin;
    
    animals.push(animal);
    scene.add(animal.mesh);
    stats.currentAnimals = animals.length;
    
    // Add fruit to a random existing border tree
    addFruitToRandomTree(data.stablecoin, amount);
    
    // If massive transaction (>$10k), spawn new border tree if under limit
    if (amount > MASSIVE_TRANSACTION_THRESHOLD && borderTrees.length < MAX_BORDER_TREES) {
        createNewBorderTree(data.stablecoin, amount);
        
        // Also spawn a power-up fruit for massive transactions
        createPowerUpFruit();
    }
    
    // Update statistics
    stats.total++;
    stats[data.stablecoin]++;
    stats.currentPlants = borderTrees.length; // Update to reflect border trees
    updateStats();
    
    // Log performance metrics periodically
    if (stats.total % 100 === 0) {
        console.log(`Garden stats: ${borderTrees.length} border trees, ${animals.length} animals, ${renderer.info.render.triangles} triangles`);
    }
}

// Remove the oldest plants from the garden
function removeOldestPlants(count) {
    // Sort by creation time and remove the oldest
    particles.sort((a, b) => a.createdAt - b.createdAt);
    
    const plantsToRemove = particles.splice(0, Math.min(count, particles.length));
    
    plantsToRemove.forEach(plant => {
        scene.remove(plant.mesh);
        plant.dispose();
    });
    
    console.log(`Removed ${plantsToRemove.length} oldest plants. Current count: ${particles.length}`);
}

// Remove the oldest animals from the garden
function removeOldestAnimals(count) {
    // Sort by creation time and remove the oldest
    animals.sort((a, b) => a.createdAt - b.createdAt);
    
    const animalsToRemove = animals.splice(0, Math.min(count, animals.length));
    
    animalsToRemove.forEach(animal => {
        scene.remove(animal.mesh);
        animal.dispose();
    });
    
    console.log(`Removed ${animalsToRemove.length} oldest animals. Current count: ${animals.length}`);
}

// Transaction feed history
const transactionFeed = [];
const maxFeedItems = 20;
let totalVolumeUSDC = 0;
let totalVolumeUSDT = 0;
let totalVolumeDAI = 0;

// Update statistics display
function updateStats() {
    // Count total fruits across all trees
    const totalFruits = borderTrees.reduce((sum, tree) => sum + tree.fruits.length, 0);
    
    // Update garden stats
    const gardenEl = document.getElementById('plant-count');
    if (gardenEl) {
        gardenEl.textContent = `${stats.currentPlants} trees / ${stats.currentAnimals} animals`;
    }
    
    // Update main transaction counts with flash animation
    updateCountWithFlash('total-transactions', stats.total);
    updateCountWithFlash('usdc-count', stats.USDC);
    updateCountWithFlash('usdt-count', stats.USDT);
    updateCountWithFlash('dai-count', stats.DAI);
    
    // Update volume displays
    updateVolumeDisplay('usdc', totalVolumeUSDC);
    updateVolumeDisplay('usdt', totalVolumeUSDT);
    updateVolumeDisplay('dai', totalVolumeDAI);
    
    // Update queue count
    const queueStats = wsManager.getSpawnQueue().getStats();
    const queueCountEl = document.getElementById('queue-count');
    if (queueCountEl) {
        queueCountEl.textContent = queueStats.queueLength;
        queueCountEl.style.background = queueStats.queueLength > 10 ? 
            'rgba(255, 0, 0, 0.3)' : 
            queueStats.queueLength > 5 ? 
                'rgba(255, 165, 0, 0.3)' : 
                'rgba(0, 255, 0, 0.3)';
    }
    
    // Update field count
    const fieldCountEl = document.getElementById('field-count');
    if (fieldCountEl) {
        fieldCountEl.textContent = animals.length;
        fieldCountEl.style.background = animals.length > 30 ? 
            'rgba(255, 0, 0, 0.3)' : 
            animals.length > 20 ? 
                'rgba(255, 165, 0, 0.3)' : 
                'rgba(0, 255, 0, 0.3)';
    }
    
    // Show money collected if any
    const moneyEl = document.getElementById('money-collected');
    if (moneyEl) {
        moneyEl.textContent = `$${formatNumber(moneyCollected)}`;
    }
    
    // Update lives counter
    const livesEl = document.getElementById('lives-count');
    if (livesEl) {
        livesEl.textContent = `${gameState.lives}/${gameState.maxLives}`;
    }
    
    // Update field animals display
    updateFieldAnimals();
}

// Update volume display for each coin
function updateVolumeDisplay(coin, volume) {
    const volEl = document.getElementById(`${coin}-volume`);
    if (volEl) {
        volEl.textContent = `$${formatNumber(volume)}`;
    }
}

// Update count with flash animation
function updateCountWithFlash(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        const oldValue = parseInt(el.textContent) || 0;
        el.textContent = value;
        
        // Add flash animation if value changed
        if (value > oldValue) {
            el.classList.add('flash');
            setTimeout(() => el.classList.remove('flash'), 500);
        }
    }
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(2);
}

// Add transaction to live feed
function addToTransactionFeed(data) {
    const feedEl = document.getElementById('transaction-list');
    if (!feedEl) return;
    
    // Create transaction item
    const txItem = document.createElement('div');
    txItem.className = 'transaction-item';
    
    const coin = data.stablecoin.toLowerCase();
    const amount = parseFloat(data.amount);
    const time = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    // Create Basescan link if we have a tx hash
    let txHash = data.tx_hash;
    
    // Handle Some() wrapper from Rust
    if (txHash && txHash.startsWith('Some(')) {
        txHash = txHash.slice(5, -1); // Remove "Some(" and ")"
    }
    
    const shortHash = txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : '';
    const basescanUrl = txHash ? `https://basescan.org/tx/${txHash}` : null;
    
    txItem.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <span class="tx-coin ${coin}">${data.stablecoin}</span>
            <span class="tx-amount">$${formatNumber(amount)}</span>
            ${basescanUrl ? 
                `<a href="${basescanUrl}" target="_blank" rel="noopener noreferrer" class="tx-link" title="View on Basescan: ${txHash}">
                    ${shortHash}
                </a>` : 
                ''
            }
        </div>
        <span class="tx-time">${time}</span>
    `;
    
    // Add to feed (prepend for newest first)
    feedEl.insertBefore(txItem, feedEl.firstChild);
    
    // Keep only max items
    while (feedEl.children.length > maxFeedItems) {
        feedEl.removeChild(feedEl.lastChild);
    }
    
    // Add to history
    transactionFeed.unshift({ data, time, element: txItem });
    if (transactionFeed.length > maxFeedItems) {
        transactionFeed.pop();
    }
}

// Update field animals display
function updateFieldAnimals() {
    const fieldEl = document.getElementById('field-animals');
    if (!fieldEl) return;
    
    // Clear and rebuild
    fieldEl.innerHTML = '';
    
    // Sort animals by amount (largest first)
    const sortedAnimals = [...animals].sort((a, b) => b.amount - a.amount);
    
    // Show top 10 animals
    sortedAnimals.slice(0, 10).forEach(animal => {
        const animalDiv = document.createElement('div');
        animalDiv.className = 'field-animal';
        
        const emoji = getAnimalEmoji(animal.animalType);
        const amount = animal.amount || 0;
        const coin = animal.stablecoin || 'USDC';
        
        animalDiv.innerHTML = `
            <span>
                <span class="animal-icon">${emoji}</span>
                <span class="tx-coin ${coin.toLowerCase()}">${coin}</span>
            </span>
            <span class="animal-size">$${formatNumber(amount)}</span>
        `;
        
        fieldEl.appendChild(animalDiv);
    });
}

// Get emoji for animal type
function getAnimalEmoji(type) {
    const emojiMap = {
        'rabbit': '🐰',
        'fox': '🦊',
        'deer': '🦌',
        'bear': '🐻',
        'wolf': '🐺',
        'eagle': '🦅',
        'owl': '🦉',
        'hawk': '🦜'
    };
    return emojiMap[type] || '🦊';
    
    // Update player size indicator
    const sizeEl = document.getElementById('player-size');
    if (sizeEl && playerControls) {
        let sizeText = '';
        let sizeColor = '#FFFFFF';
        
        if (leverageActive && currentLeverageMultiplier > 1) {
            sizeText = `${playerControls.size.toFixed(2)} (${naturalPlayerSize.toFixed(2)}×${currentLeverageMultiplier.toFixed(1)})`;
            sizeColor = '#FFD700'; // Gold when leveraged
        } else if (speedrunActive) {
            sizeText = playerControls.size.toFixed(2);
            sizeColor = '#00FFFF'; // Cyan when speed boosted
        } else {
            sizeText = playerControls.size.toFixed(2);
            sizeColor = '#FFFFFF'; // White normally
        }
        
        // Add difficulty indicator
        if (difficultyLevel === 'alliance') {
            sizeText += ' ⚔️'; // Sword emoji for alliance mode
            if (sizeColor === '#FFFFFF') {
                sizeColor = '#FF00FF'; // Purple for alliance mode
            }
        } else if (difficultyLevel === 'survival') {
            sizeText += ' 🔥'; // Fire emoji for survival mode
            if (sizeColor === '#FFFFFF') {
                sizeColor = '#FF6B6B'; // Red tint for survival mode
            }
        }
        
        sizeEl.textContent = sizeText;
        sizeEl.style.color = sizeColor;
    }
    
    // Update the page title to show adoption progress
    document.title = `Stablecoin Garden - ${borderTrees.length} Trees, ${totalFruits} Fruits`;
    
    // Add color coding based on tree growth
    const plantCountEl = document.getElementById('plant-count');
    if (borderTrees.length >= MAX_BORDER_TREES * 0.9) {
        plantCountEl.style.color = '#FFD700'; // Gold when nearly full
    } else if (borderTrees.length >= MAX_BORDER_TREES * 0.7) {
        plantCountEl.style.color = '#90EE90'; // Light green when growing well
    } else {
        plantCountEl.style.color = '#ffffff';
    }
}

// Animation loop
let lastTime = 0;
let animationId;
function animate(currentTime) {
    animationId = requestAnimationFrame(animate);
    
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update player controls and check for collisions
    if (playerControls.isPlaying) {
        updatePlayerMovement(delta || 0.016);
        updateCameraFollow();
        checkCollisions();
        
        // Check for power-up fruit timer (every 2 minutes)
        const currentTime = Date.now();
        if (currentTime - lastPowerUpTime > POWER_UP_INTERVAL) {
            createPowerUpFruit();
            lastPowerUpTime = currentTime;
        }
        
        // Check for leverage fruit timer (every 1.5 minutes)
        if (currentTime - lastLeverageFruitTime > LEVERAGE_FRUIT_INTERVAL) {
            createLeverageFruit();
            lastLeverageFruitTime = currentTime;
        }
        
        // Check for speedrun fruit timer (every 1.25 minutes)
        if (currentTime - lastSpeedrunFruitTime > SPEEDRUN_FRUIT_INTERVAL) {
            createSpeedrunFruit();
            lastSpeedrunFruitTime = currentTime;
        }
    }
    
    // Update power-up fruits
    updatePowerUpFruits();
    
    // Update leverage fruits
    updateLeverageFruits();
    
    // Update speedrun fruits
    updateSpeedrunFruits();
    
    // Update border trees (animate fruits)
    borderTrees.forEach(tree => {
        if (tree.fruits.length > 0) {
            const time = Date.now() * 0.001;
            tree.fruits.forEach((fruit, index) => {
                // Gentle bobbing animation for fruits
                const phase = time + index * 0.5;
                fruit.position.y += Math.sin(phase * 2) * 0.02;
                
                // Gentle glowing effect
                if (fruit.material.emissiveIntensity !== undefined) {
                    fruit.material.emissiveIntensity = 0.3 + Math.sin(phase * 3) * 0.1;
                }
            });
        }
    });
    
    // Update animals and remove dead ones
    animals = animals.filter(animal => {
        const alive = animal.update();
        if (!alive) {
            scene.remove(animal.mesh);
            animal.dispose();
            stats.currentAnimals--;
            return false;
        }
        return true;
    });
    
    // Check and update difficulty scaling
    if (playerControls.isPlaying) {
        checkDifficultyScaling();
    }
    
    // Animate garden elements
    if (!isPaused) {
        const time = Date.now() * 0.0001;
        
        // Only do automatic camera movement if not in game mode
        if (!playerControls.isPlaying) {
            // Gentle camera movement around garden
            camera.position.x = Math.cos(time) * 80;
            camera.position.z = Math.sin(time) * 80;
            camera.position.y = 20 + Math.sin(time * 2) * 5; // Slight vertical movement
            camera.lookAt(0, -10, 0);
        }
        
        // Animate flowers and bushes with gentle sway
        gardenElements.forEach((element, index) => {
            if (element.children.length > 0) {
                // Gentle swaying motion for trees and flowers
                element.rotation.z = Math.sin(time * 2 + index) * 0.02;
                element.rotation.x = Math.cos(time * 1.5 + index) * 0.01;
            }
        });
    }
    
    renderer.render(scene, camera);
}

// Removed old bird collision function
/* Old checkBirdCollisions removed - now using checkCollisions for ground-based player */

function checkBirdCollisions_REMOVED() {
    if (gameState.isGameOver) return;
    
    const birdPosition = camera.position;
    const collisionRadius = 3; // Bird collision radius
    
    // Check plant collisions (game over condition)
    for (let plant of particles) {
        const distance = birdPosition.distanceTo(plant.mesh.position);
        const plantCollisionRadius = plant.isFullyGrown ? plant.targetHeight * 0.5 : 0;
        
        if (distance < collisionRadius + plantCollisionRadius) {
            // Game Over - hit a plant!
            triggerGameOver('plant');
            return;
        }
    }
    
    // Check animal collisions (collect money)
    animals.forEach(animal => {
        if (!animal.isAlive) return;
        
        const distance = birdPosition.distanceTo(animal.mesh.position);
        
        // Check if bird collides with animal
        if (distance < collisionRadius + animal.size) {
            // Consume the animal
            const value = animal.consume();
            stats.moneyCollected += value;
            gameState.currentScore = stats.moneyCollected;
            
            // Visual feedback for eating
            showEatEffect(animal.mesh.position, value, animal.stablecoin);
            
            // Update stats
            updateStats();
            
            console.log(`Ate ${animal.animalType} worth $${value.toFixed(2)}! Total: $${stats.moneyCollected.toFixed(2)}`);
        }
    });
}

// Show visual effect when eating an animal
function showEatEffect(position, value, stablecoin) {
    // Create particle burst effect
    const particleCount = Math.min(20, Math.floor(value / 100) + 5);
    const color = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 4, 4),
            new THREE.MeshBasicMaterial({ 
                color: color,
                transparent: true,
                opacity: 0.8
            })
        );
        
        particle.position.copy(position);
        scene.add(particle);
        
        // Animate particle
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 3 + 2,
            (Math.random() - 0.5) * 2
        );
        
        const animateParticle = () => {
            particle.position.add(velocity);
            velocity.y -= 0.1;
            particle.material.opacity -= 0.02;
            
            if (particle.material.opacity > 0) {
                requestAnimationFrame(animateParticle);
            } else {
                scene.remove(particle);
                particle.geometry.dispose();
                particle.material.dispose();
            }
        };
        
        animateParticle();
    }
    
    // Show value text (optional - could add floating text here)
}

// Trigger game over (old function - kept for compatibility)
function triggerGameOver(reason) {
    if (gameState.isGameOver) return;
    
    gameState.isGameOver = true;
    gameState.endTime = Date.now();
    
    // Stop player movement
    if (playerControls.isPlaying) {
        playerControls.velocity.set(0, 0, 0);
        playerControls.moveForward = false;
        playerControls.moveBackward = false;
        playerControls.moveLeft = false;
        playerControls.moveRight = false;
        playerControls.rotateLeft = false;
        playerControls.rotateRight = false;
        playerControls.boost = false;
    }
    
    // Update high score
    if (gameState.currentScore > gameState.highScore) {
        gameState.highScore = gameState.currentScore;
        localStorage.setItem('stablecoinHuntHighScore', gameState.highScore.toString());
    }
    
    // Show game over screen
    showGameOverScreen(reason);
    
    console.log(`GAME OVER! Hit a ${reason}. Score: $${gameState.currentScore.toFixed(2)}`);
}

// Show game over screen
function showGameOverScreen(reason) {
    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'game-over-screen';
    gameOverDiv.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    background: linear-gradient(135deg, rgba(255, 0, 0, 0.9), rgba(139, 0, 0, 0.9)); 
                    color: white; padding: 40px; border-radius: 20px; text-align: center; 
                    z-index: 2000; box-shadow: 0 10px 40px rgba(0,0,0,0.8); min-width: 400px;">
            <h1 style="margin: 0 0 20px 0; font-size: 48px;">💀 GAME OVER 💀</h1>
            <p style="font-size: 24px; margin: 10px 0;">You hit a poisonous plant!</p>
            <div style="margin: 30px 0;">
                <p style="font-size: 20px; margin: 10px 0;">Final Score: <span style="color: #FFD700; font-size: 32px; font-weight: bold;">$${gameState.currentScore.toFixed(2)}</span></p>
                <p style="font-size: 16px; margin: 10px 0;">High Score: <span style="color: #FFD700;">$${gameState.highScore.toFixed(2)}</span></p>
                ${gameState.startTime ? `<p style="font-size: 14px; margin: 10px 0;">Survived: ${Math.floor((gameState.endTime - gameState.startTime) / 1000)} seconds</p>` : ''}
            </div>
            <div style="margin-top: 30px;">
                <button onclick="restartGame()" style="
                    background: linear-gradient(135deg, #43e97b, #38f9d7);
                    color: white; border: none; padding: 15px 30px; border-radius: 10px;
                    font-size: 18px; font-weight: bold; cursor: pointer; margin: 0 10px;
                    transition: transform 0.2s;">
                    🔄 Try Again
                </button>
                <button onclick="exitToGarden()" style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white; border: none; padding: 15px 30px; border-radius: 10px;
                    font-size: 18px; font-weight: bold; cursor: pointer; margin: 0 10px;
                    transition: transform 0.2s;">
                    🏡 Exit to Garden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(gameOverDiv);
    
    // Make plants glow red to show danger
    particles.forEach(plant => {
        if (plant.mesh.visible) {
            // Add red glow to plants
            const glowGeometry = new THREE.SphereGeometry(plant.targetHeight * 0.8, 8, 6);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
            });
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            glowMesh.position.y = plant.targetHeight * 0.5;
            plant.mesh.add(glowMesh);
            
            // Pulse the glow
            const pulseGlow = () => {
                if (gameState.isGameOver && glowMesh.parent) {
                    glowMesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.2;
                    requestAnimationFrame(pulseGlow);
                }
            };
            pulseGlow();
        }
    });
}

// Restart the game
function restartGame() {
    // Simply reload the page for now
    location.reload();
}

// Exit to garden view
function exitToGarden() {
    // Remove game over screen
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) gameOverScreen.remove();
    
    // Exit game mode
    playerControls.isPlaying = false;
    gameState.isGameOver = false;
    gameOver = false;
    
    // Reset stats but keep entities
    moneyCollected = 0;
    gameState.currentScore = 0;
    updateStats();
}

// Removed old bird flight physics function

// Setup WebSocket event listeners
function setupWebSocketListeners() {
    // Listen for status changes
    wsManager.addEventListener('status:change', (event) => {
        const statusEl = document.getElementById('status');
        const { status } = event.detail;
        
        switch(status) {
            case 'connected':
                statusEl.textContent = 'LIVE';
                statusEl.className = 'connected';
                updateLatency();
                break;
            case 'connecting':
                statusEl.textContent = 'CONNECTING';
                statusEl.className = 'connecting';
                break;
            case 'disconnected':
                statusEl.textContent = 'OFFLINE';
                statusEl.className = 'disconnected';
                document.getElementById('latency').textContent = '--ms';
                break;
            case 'error':
                statusEl.textContent = 'ERROR';
                statusEl.className = 'error';
                break;
            case 'simulating':
                statusEl.textContent = 'DEMO MODE';
                statusEl.className = 'simulating';
                document.getElementById('latency').textContent = 'local';
                break;
        }
    });
    
    // Update latency periodically
    function updateLatency() {
        if (wsManager.isConnected()) {
            const ping = Math.floor(Math.random() * 30 + 10); // Simulated ping
            document.getElementById('latency').textContent = `${ping}ms`;
        }
    }
    setInterval(updateLatency, 5000);
    
    // Listen for transactions (for statistics only)
    wsManager.addEventListener('transaction', (event) => {
        const data = event.detail;
        
        // Update statistics only - animals are spawned via spawn:animal event
        stats.transactions++;
        stats.volume += parseFloat(data.amount) || 0;
        updateStats();
    });
    
    // Listen for spawn:animal events from the spawn queue
    window.addEventListener('spawn:animal', (event) => {
        const data = event.detail;
        
        // Add transaction to the visualization (creates the animal)
        addTransaction(data);
    });
    
    // Listen for connection events
    wsManager.addEventListener('connection:open', () => {
        console.log('WebSocket connected');
    });
    
    wsManager.addEventListener('connection:close', () => {
        console.log('WebSocket disconnected');
    });
    
    wsManager.addEventListener('connection:error', (event) => {
        console.error('WebSocket error:', event.detail);
    });
}

// Connection control functions (delegates to wsManager)
function connectWebSocket() {
    wsManager.connect();
}

function disconnectWebSocket() {
    wsManager.disconnect();
}

// Clear all entities (keep border trees but remove fruits, clear animals)
function clearParticles() {
    // Clear fruits from all border trees but keep trees
    borderTrees.forEach(tree => {
        tree.fruits.forEach(fruit => {
            tree.mesh.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
        });
        tree.fruits = [];
    });
    
    // Clear animals
    animals.forEach(animal => {
        scene.remove(animal.mesh);
        animal.dispose();
    });
    animals = [];
    
    // Reset stats (but keep money collected and trees)
    stats.total = 0;
    stats.USDC = 0;
    stats.USDT = 0;
    stats.DAI = 0;
    stats.currentAnimals = 0;
    // Keep currentPlants as it represents border trees
    updateStats();
    
    console.log('Garden cleared - Border trees and money preserved. Trees: ' + borderTrees.length);
}

// Setup event listeners
function setupEventListeners() {
    const pauseBtn = document.getElementById('pause-btn');
    const clearBtn = document.getElementById('clear-btn');
    const playBtn = document.getElementById('play-btn');
    
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    });
    
    clearBtn.addEventListener('click', clearParticles);
    
    playBtn.addEventListener('click', () => {
        toggleGameMode();
    });
    
    // Player ground controls
    setupPlayerControls();
}

// Setup player ground controls
function setupPlayerControls() {
    let isPointerLocked = false;
    
    // Keyboard controls
    document.addEventListener('keydown', (event) => {
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                playerControls.moveForward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                playerControls.moveBackward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                playerControls.moveLeft = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                playerControls.moveRight = true;
                break;
            case 'KeyQ':
                playerControls.rotateLeft = true;
                break;
            case 'KeyE':
                playerControls.rotateRight = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                playerControls.boost = true;
                break;
            case 'Escape':
                // Exit game mode
                if (playerControls.isPlaying) {
                    toggleGameMode();
                }
                break;
        }
    });
    
    document.addEventListener('keyup', (event) => {
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                playerControls.moveForward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                playerControls.moveBackward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                playerControls.moveLeft = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                playerControls.moveRight = false;
                break;
            case 'KeyQ':
                playerControls.rotateLeft = false;
                break;
            case 'KeyE':
                playerControls.rotateRight = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                playerControls.boost = false;
                break;
        }
    });
    
    // Mouse controls for looking around
    const canvas = renderer.domElement;
    
    canvas.addEventListener('click', () => {
        if (playerControls.isPlaying) {
            canvas.requestPointerLock();
        }
    });
    
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === canvas;
    });
    
    document.addEventListener('mousemove', (event) => {
        if (isPointerLocked && playerControls.isPlaying) {
            playerControls.mouseX = event.movementX;
            playerControls.mouseY = event.movementY;
        }
    });
    
    // Touch controls for mobile (ground movement)
    let touchStartX = 0;
    let touchStartY = 0;
    
    canvas.addEventListener('touchstart', (event) => {
        if (playerControls.isPlaying) {
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
        }
    });
    
    canvas.addEventListener('touchmove', (event) => {
        if (playerControls.isPlaying) {
            const touchX = event.touches[0].clientX;
            const touchY = event.touches[0].clientY;
            
            // Convert touch movement to walking direction
            const deltaX = touchX - touchStartX;
            const deltaY = touchY - touchStartY;
            
            // Map touch to movement keys
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Horizontal movement
                if (deltaX > 20) {
                    playerControls.moveRight = true;
                    playerControls.moveLeft = false;
                } else if (deltaX < -20) {
                    playerControls.moveLeft = true;
                    playerControls.moveRight = false;
                }
            } else {
                // Vertical movement
                if (deltaY < -20) {
                    playerControls.moveForward = true;
                    playerControls.moveBackward = false;
                } else if (deltaY > 20) {
                    playerControls.moveBackward = true;
                    playerControls.moveForward = false;
                }
            }
            
            // Camera rotation with smaller swipes
            playerControls.mouseX = deltaX * 0.1;
            playerControls.mouseY = deltaY * 0.1;
            
            event.preventDefault();
        }
    });
    
    canvas.addEventListener('touchend', (event) => {
        if (playerControls.isPlaying) {
            // Stop movement when touch ends
            playerControls.moveForward = false;
            playerControls.moveBackward = false;
            playerControls.moveLeft = false;
            playerControls.moveRight = false;
            playerControls.mouseX = 0;
            playerControls.mouseY = 0;
        }
    });
}

// Toggle bird flight mode
function toggleGameMode() {
    if (gameOver) {
        location.reload();
        return;
    }
    
    playerControls.isPlaying = !playerControls.isPlaying;
    
    const playBtn = document.getElementById('play-btn');
    const gameStatus = document.getElementById('game-status');
    
    if (playerControls.isPlaying) {
        // Enter game mode - start the game!
        playerControls.velocity.set(0, 0, 0);
        playerControls.size = 1.0;
        naturalPlayerSize = 1.0;
        moneyCollected = 0;
        gameOver = false;
        
        // Reset game state including lives
        gameState.lives = 1;
        gameState.isGameOver = false;
        gameState.startTime = Date.now();
        
        // Initialize power-up timer
        lastPowerUpTime = Date.now();
        
        // Create player
        createPlayer();
        
        // Update UI
        playBtn.textContent = '🛑 Stop';
        playBtn.classList.add('active');
        gameStatus.style.display = 'block';
        updateStats();
        
        // Request pointer lock
        renderer.domElement.requestPointerLock();
        
        console.log('GAME STARTED! Eat smaller animals (blue), avoid larger ones (red)! Collect pink fruits for extra lives!');
    } else {
        // Exit game mode
        document.exitPointerLock();
        
        // Remove player from scene
        if (playerControls.mesh) {
            scene.remove(playerControls.mesh);
            playerControls.mesh = null;
        }
        
        // Clear power-up fruits (now ground-based)
        powerUpFruits.forEach(fruit => {
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
        });
        powerUpFruits = [];
        
        // Clear leverage fruits
        leverageFruits.forEach(fruit => {
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
        });
        leverageFruits = [];
        
        // Clear speedrun fruits
        speedrunFruits.forEach(fruit => {
            scene.remove(fruit);
            fruit.geometry.dispose();
            fruit.material.dispose();
        });
        speedrunFruits = [];
        
        // Reset leverage effects
        resetLeverageEffect();
        
        // Reset speedrun effects
        resetSpeedrunEffect();
        
        // Update UI
        playBtn.textContent = '🎮 Play';
        playBtn.classList.remove('active');
        gameStatus.style.display = 'none';
        
        // Reset game state
        gameState.isGameOver = false;
        gameState.startTime = null;
        
        console.log('Game mode deactivated');
    }
}

// Removed old bird-related UI functions

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
    setupEventListeners();
    setupWebSocketListeners();
    
    // Automatically connect to WebSocket on page load
    wsManager.connect();
});

// Make game functions globally accessible for HTML buttons
window.restartGame = restartGame;
window.exitToGarden = exitToGarden;

// Expose spawn queue configuration for debugging and tuning
window.configureSpawnQueue = function(options) {
    wsManager.configureSpawnQueue(options);
    console.log('Spawn queue configured:', wsManager.getSpawnQueue().getStats());
};

// Helper function to get spawn queue stats
window.getSpawnQueueStats = function() {
    return wsManager.getSpawnQueue().getStats();
};

// Example usage logging
console.log(`
🎮 Spawn Queue Controls:
- configureSpawnQueue({spawnDelay: 1000}) - Set spawn delay (ms)
- configureSpawnQueue({smallerRatio: 0.7}) - Set % of animals smaller than player
- configureSpawnQueue({maxQueueSize: 100}) - Set max queue size
- getSpawnQueueStats() - View current queue statistics
`);