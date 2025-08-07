// Three.js scene setup
let scene, camera, renderer;
let particles = [];
let isPaused = false;
let ws = null;
let gameOver = false;
let moneyCollected = 0;

// Player controls (ground-based animal)
let playerControls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    boost: false,
    velocity: new THREE.Vector3(),
    rotation: 0,
    mouseX: 0,
    mouseY: 0,
    isPlaying: false,
    size: 1.0,  // Player's current size
    mesh: null,  // Player's 3D model
    speed: 10   // Base movement speed
};

// Game state
let gameState = {
    isGameOver: false,
    highScore: 0,
    currentScore: 0,
    startTime: null,
    endTime: null
};

// Configuration
const MAX_PLANTS = 10000; // Maximum number of plants in the garden
const REMOVE_BATCH_SIZE = 100; // Number of oldest plants to remove when cap is reached

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
        
        // Animal size based on amount
        const amountLog = Math.log10(this.amount + 1);
        this.size = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4); // 0.5-4 units
        
        // Create animal group
        this.mesh = new THREE.Group();
        
        // Random spawn position
        this.mesh.position.x = (Math.random() - 0.5) * 80;
        this.mesh.position.y = -30 + this.size; // Start on ground
        this.mesh.position.z = (Math.random() - 0.5) * 80;
        
        // Movement properties
        this.velocity = new THREE.Vector3();
        this.targetDirection = Math.random() * Math.PI * 2;
        this.speed = 5 + Math.random() * 10; // Faster animals are harder to catch
        this.turnSpeed = 0.05 + Math.random() * 0.05;
        this.jumpCooldown = 0;
        this.fleeRadius = 20; // Distance at which animal flees from bird
        
        // Get animal color based on stablecoin
        this.baseColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
        
        // Create animal based on amount
        if (this.amount < 100) {
            this.createSmallAnimal(); // Rabbit
            this.animalType = 'rabbit';
            this.speed *= 1.5; // Rabbits are fast
        } else if (this.amount < 1000) {
            this.createMediumAnimal(); // Fox
            this.animalType = 'fox';
        } else if (this.amount < 10000) {
            this.createLargeAnimal(); // Deer
            this.animalType = 'deer';
            this.speed *= 0.8; // Deer are slightly slower
        } else {
            this.createGiantAnimal(); // Bear (whale transaction)
            this.animalType = 'bear';
            this.speed *= 0.5; // Bears are slow but valuable
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
        
        // Check distance to player for behavior
        if (playerControls.mesh) {
            const distanceToPlayer = playerControls.mesh.position.distanceTo(this.mesh.position);
            
            // Different behaviors based on relative size
            if (playerControls.isPlaying && distanceToPlayer < this.fleeRadius) {
                if (this.size < playerControls.size * 0.8) {
                    // Smaller than player - flee!
                    const fleeDirection = new THREE.Vector3();
                    fleeDirection.subVectors(this.mesh.position, playerControls.mesh.position);
                    fleeDirection.y = 0;
                    fleeDirection.normalize();
                    
                    this.targetDirection = Math.atan2(fleeDirection.x, fleeDirection.z);
                    this.speed = Math.min(this.speed * 1.5, 30); // Panic speed
                    
                    // Jump when fleeing
                    if (this.jumpCooldown <= 0 && Math.random() < 0.1) {
                        this.velocity.y = 5 + Math.random() * 5;
                        this.jumpCooldown = 60;
                    }
                } else if (this.size > playerControls.size * 1.2) {
                    // Larger than player - chase!
                    const chaseDirection = new THREE.Vector3();
                    chaseDirection.subVectors(playerControls.mesh.position, this.mesh.position);
                    chaseDirection.y = 0;
                    chaseDirection.normalize();
                    
                    this.targetDirection = Math.atan2(chaseDirection.x, chaseDirection.z);
                    this.speed = Math.min(this.speed * 1.2, 25);
                }
            } else {
                // Wander randomly
                this.targetDirection += (Math.random() - 0.5) * this.turnSpeed;
                this.speed = 5 + Math.random() * 5;
            }
        } else {
            // Wander randomly
            this.targetDirection += (Math.random() - 0.5) * this.turnSpeed;
            this.speed = 5 + Math.random() * 5;
        }
        
        // Apply movement
        this.velocity.x = Math.sin(this.targetDirection) * this.speed * 0.1;
        this.velocity.z = Math.cos(this.targetDirection) * this.speed * 0.1;
        
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
        
        this.age++;
        return this.isAlive;
    }
    
    // Update threat indicator based on player size
    updateThreatIndicator() {
        if (!playerControls.isPlaying) {
            // Remove indicators when not playing
            if (this.indicator) {
                this.mesh.remove(this.indicator);
                this.indicator.geometry.dispose();
                this.indicator.material.dispose();
                this.indicator = null;
            }
            return;
        }
        
        // Determine if prey (blue), neutral (yellow), or predator (red)
        let indicatorColor;
        if (this.size < playerControls.size * 0.8) {
            indicatorColor = 0x4A90E2; // Blue - can eat
        } else if (this.size > playerControls.size * 1.2) {
            indicatorColor = 0xFF0000; // Red - dangerous!
        } else {
            indicatorColor = 0xFFFF00; // Yellow - similar size
        }
        
        // Create or update indicator
        if (!this.indicator) {
            const indicatorGeometry = new THREE.RingGeometry(this.size * 1.5, this.size * 1.8, 8);
            const indicatorMaterial = new THREE.MeshBasicMaterial({
                color: indicatorColor,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            });
            this.indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
            this.indicator.rotation.x = -Math.PI / 2;
            this.indicator.position.y = 0.1;
            this.mesh.add(this.indicator);
        } else {
            this.indicator.material.color.set(indicatorColor);
        }
        
        // Pulse indicator for emphasis
        const pulse = Math.sin(Date.now() * 0.005) * 0.2 + 0.5;
        this.indicator.material.opacity = pulse;
    }
    
    // Called when eaten
    consume() {
        this.isAlive = false;
        // Return the value consumed
        return this.amount;
    }
    
    dispose() {
        if (this.indicator) {
            this.mesh.remove(this.indicator);
            this.indicator.geometry.dispose();
            this.indicator.material.dispose();
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
    
    // Check collisions with animals
    for (let i = animals.length - 1; i >= 0; i--) {
        const animal = animals[i];
        const distance = playerPos.distanceTo(animal.mesh.position);
        const collisionDistance = playerRadius + animal.size;
        
        if (distance < collisionDistance) {
            if (animal.size < playerControls.size * 0.8) {
                // Eat smaller animal
                eatAnimal(animal, i);
            } else if (animal.size > playerControls.size * 1.2) {
                // Eaten by larger animal - game over
                handleGameOver();
                return;
            }
            // Similar size - just bounce off
        }
    }
    
    // Check collisions with plants (obstacles, not deadly)
    particles.forEach(plant => {
        if (plant.mesh) {
            const distance = playerPos.distanceTo(plant.mesh.position);
            const collisionDistance = playerRadius + (plant.size || 1) * 0.5;
            
            if (distance < collisionDistance) {
                // Push player away from plant
                const pushDirection = new THREE.Vector3()
                    .subVectors(playerPos, plant.mesh.position)
                    .normalize();
                playerControls.mesh.position.add(pushDirection.multiplyScalar(collisionDistance - distance));
            }
        }
    });
}

// Handle eating an animal
function eatAnimal(animal, index) {
    // Add to money collected
    moneyCollected += animal.value;
    
    // Grow player size
    const growthFactor = Math.log10(animal.value + 1) * 0.1;
    playerControls.size = Math.min(playerControls.size + growthFactor, 10); // Max size of 10
    
    // Update player mesh scale
    playerControls.mesh.scale.setScalar(playerControls.size);
    playerControls.mesh.position.y = playerControls.size * 0.5 - 30;
    
    // Remove animal
    scene.remove(animal.mesh);
    scene.remove(animal.indicator);
    animals.splice(index, 1);
    
    // Update UI
    updateStats();
    
    // Play eat sound effect (visual feedback)
    flashScreen(0x00ff00, 100);
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

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Add a new transaction - 95% animals, 5% plants
function addTransaction(data) {
    // Check if we've reached the entity cap
    const totalEntities = particles.length + animals.length;
    if (totalEntities >= MAX_PLANTS) {
        // Remove oldest entities to make room
        if (animals.length > 0) {
            removeOldestAnimals(Math.min(REMOVE_BATCH_SIZE, animals.length));
        }
        if (particles.length > 0 && totalEntities >= MAX_PLANTS) {
            removeOldestPlants(Math.min(REMOVE_BATCH_SIZE / 2, particles.length));
        }
    }
    
    // 5% chance for plant, 95% for animal
    if (Math.random() < 0.05) {
        // Create plant
        const plant = new TransactionPlant(
            data.stablecoin,
            data.amount,
            data.from,
            data.to
        );
        
        particles.push(plant);
        scene.add(plant.mesh);
        stats.currentPlants = particles.length;
    } else {
        // Create animal
        const animal = new TransactionAnimal(
            data.stablecoin,
            data.amount,
            data.from,
            data.to
        );
        
        animals.push(animal);
        scene.add(animal.mesh);
        stats.currentAnimals = animals.length;
    }
    
    // Update statistics
    stats.total++;
    stats[data.stablecoin]++;
    updateStats();
    
    // Log performance metrics periodically
    if (stats.total % 100 === 0) {
        console.log(`Garden stats: ${particles.length} plants, ${animals.length} animals, ${renderer.info.render.triangles} triangles`);
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

// Update statistics display
function updateStats() {
    document.getElementById('plant-count').textContent = `${stats.currentPlants} 🌳 / ${stats.currentAnimals} 🦊`;
    document.getElementById('total-transactions').textContent = stats.total;
    document.getElementById('usdc-count').textContent = stats.USDC;
    document.getElementById('usdt-count').textContent = stats.USDT;
    document.getElementById('dai-count').textContent = stats.DAI;
    
    // Show money collected if any
    const moneyEl = document.getElementById('money-collected');
    if (moneyEl) {
        moneyEl.textContent = `$${stats.moneyCollected.toFixed(2)}`;
    }
    
    // Update the page title
    document.title = `Stablecoin Hunt - $${stats.moneyCollected.toFixed(2)} collected`;
    
    // Add warning color if approaching max capacity
    const totalEntities = stats.currentPlants + stats.currentAnimals;
    const plantCountEl = document.getElementById('plant-count');
    if (totalEntities > MAX_PLANTS * 0.9) {
        plantCountEl.style.color = '#ff6b6b';
    } else if (totalEntities > MAX_PLANTS * 0.75) {
        plantCountEl.style.color = '#ffd93d';
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
    }
    
    // Update plants (all plants are now persistent)
    particles.forEach(plant => {
        plant.update();
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

// WebSocket connection
function connectWebSocket() {
    const statusEl = document.getElementById('status');
    
    // For now, we'll simulate transactions since WebSocket server isn't implemented yet
    statusEl.textContent = 'Simulating';
    statusEl.className = 'connected';
    
    // Simulate random transactions
    simulateTransactions();
    
    // Actual WebSocket code (to be used when server is ready):
    /*
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        console.log('Connected to WebSocket server');
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addTransaction(data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusEl.textContent = 'Error';
        statusEl.className = 'error';
    };
    
    ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        console.log('Disconnected from WebSocket server');
        ws = null;
    };
    */
}

// Simulate transactions for testing
function simulateTransactions() {
    if (isPaused || !ws === null) return;
    
    // Random chance to create a transaction
    if (Math.random() < 0.3) {
        const stablecoins = ['USDC', 'USDT', 'DAI'];
        const stablecoin = stablecoins[Math.floor(Math.random() * stablecoins.length)];
        
        // Generate different amount ranges for variety
        let amount;
        const rand = Math.random();
        if (rand < 0.6) {
            // 60% small transactions (1-1000)
            amount = (Math.random() * 999 + 1).toFixed(2);
        } else if (rand < 0.85) {
            // 25% medium transactions (1000-10000)
            amount = (Math.random() * 9000 + 1000).toFixed(2);
        } else if (rand < 0.95) {
            // 10% large transactions (10000-50000)
            amount = (Math.random() * 40000 + 10000).toFixed(2);
        } else {
            // 5% whale transactions (50000-500000)
            amount = (Math.random() * 450000 + 50000).toFixed(2);
        }
        
        const transaction = {
            stablecoin: stablecoin,
            amount: amount,
            from: '0x' + Math.random().toString(16).substr(2, 40),
            to: '0x' + Math.random().toString(16).substr(2, 40)
        };
        
        addTransaction(transaction);
    }
    
    // Continue simulating
    setTimeout(simulateTransactions, Math.random() * 1000 + 200);
}

// Disconnect WebSocket
function disconnectWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
    
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'disconnected';
}

// Clear all entities (plants and animals)
function clearParticles() {
    // Clear plants
    particles.forEach(plant => {
        scene.remove(plant.mesh);
        plant.dispose();
    });
    particles = [];
    
    // Clear animals
    animals.forEach(animal => {
        scene.remove(animal.mesh);
        animal.dispose();
    });
    animals = [];
    
    // Reset stats (but keep money collected)
    stats.total = 0;
    stats.USDC = 0;
    stats.USDT = 0;
    stats.DAI = 0;
    stats.currentPlants = 0;
    stats.currentAnimals = 0;
    updateStats();
    
    console.log('Garden cleared - Money collected preserved: $' + stats.moneyCollected.toFixed(2));
}

// Setup event listeners
function setupEventListeners() {
    const pauseBtn = document.getElementById('pause-btn');
    const clearBtn = document.getElementById('clear-btn');
    const connectBtn = document.getElementById('connect-btn');
    const playBtn = document.getElementById('play-btn');
    
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    });
    
    clearBtn.addEventListener('click', clearParticles);
    
    connectBtn.addEventListener('click', () => {
        if (ws === null) {
            connectWebSocket();
            connectBtn.textContent = 'Disconnect';
        } else {
            disconnectWebSocket();
            connectBtn.textContent = 'Connect';
        }
    });
    
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
            case 'ShiftLeft':
            case 'ShiftRight':
                playerControls.boost = false;
                break;
        }
    });
    
    // Mouse controls for looking around
    const canvas = renderer.domElement;
    
    canvas.addEventListener('click', () => {
        if (birdControls.isFlying) {
            canvas.requestPointerLock();
        }
    });
    
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === canvas;
    });
    
    document.addEventListener('mousemove', (event) => {
        if (isPointerLocked && birdControls.isFlying) {
            birdControls.mouseX = event.movementX;
            birdControls.mouseY = event.movementY;
        }
    });
    
    // Touch controls for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    
    canvas.addEventListener('touchstart', (event) => {
        if (birdControls.isFlying) {
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
        }
    });
    
    canvas.addEventListener('touchmove', (event) => {
        if (birdControls.isFlying) {
            const touchX = event.touches[0].clientX;
            const touchY = event.touches[0].clientY;
            
            birdControls.mouseX = (touchX - touchStartX) * 0.5;
            birdControls.mouseY = (touchY - touchStartY) * 0.5;
            
            touchStartX = touchX;
            touchStartY = touchY;
            
            event.preventDefault();
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
        moneyCollected = 0;
        gameOver = false;
        
        // Create player
        createPlayer();
        
        // Update UI
        playBtn.textContent = '🛑 Stop';
        playBtn.classList.add('active');
        gameStatus.style.display = 'block';
        updateStats();
        
        // Request pointer lock
        renderer.domElement.requestPointerLock();
        
        console.log('GAME STARTED! Eat smaller animals (blue), avoid larger ones (red)!');
    } else {
        // Exit game mode
        document.exitPointerLock();
        
        // Remove player from scene
        if (playerControls.mesh) {
            scene.remove(playerControls.mesh);
            playerControls.mesh = null;
        }
        
        // Update UI
        playBtn.textContent = '🎮 Play';
        playBtn.classList.remove('active');
        gameStatus.style.display = 'none';
        
        // Reset game state
        gameState.isGameOver = false;
        gameState.startTime = null;
        
        console.log('Bird mode deactivated');
    }
}

// Removed old bird-related UI functions

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
    setupEventListeners();
});

// Make game functions globally accessible for HTML buttons
window.restartGame = restartGame;
window.exitToGarden = exitToGarden;