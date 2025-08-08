import { CONFIG } from './config.js';

// Spawn Queue for controlling entity creation rate
class SpawnQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastSpawnTime = 0;
        this.spawnDelay = 800; // Minimum ms between spawns
        this.maxQueueSize = 50; // Maximum queue size
        
        // Size distribution settings
        this.sizeDistribution = {
            smallerThanPlayer: 0.65, // 65% smaller than player
            largerThanPlayer: 0.35   // 35% larger than player
        };
        
        this.onSpawnCallback = null;
    }
    
    enqueue(transactionData) {
        // If queue is full, remove oldest items
        if (this.queue.length >= this.maxQueueSize) {
            this.queue.shift();
        }
        
        this.queue.push({
            data: transactionData,
            timestamp: Date.now()
        });
        
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }
        
        this.processing = true;
        
        // Calculate time since last spawn
        const now = Date.now();
        const timeSinceLastSpawn = now - this.lastSpawnTime;
        
        // Wait if not enough time has passed
        if (timeSinceLastSpawn < this.spawnDelay) {
            const waitTime = this.spawnDelay - timeSinceLastSpawn;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Get next item from queue
        const item = this.queue.shift();
        if (item && this.onSpawnCallback) {
            this.sortQueueByDesiredDistribution();
            this.onSpawnCallback(item.data);
            this.lastSpawnTime = Date.now();
        }
        
        // Continue processing
        if (this.queue.length > 0) {
            requestAnimationFrame(() => this.processQueue());
        } else {
            this.processing = false;
        }
    }
    
    sortQueueByDesiredDistribution() {
        if (this.queue.length === 0 || !window.game?.playerController) return;
        
        const playerSize = window.game.playerController.controls.size || 1.0;
        
        // Calculate each transaction's size
        this.queue.forEach(item => {
            const amount = parseFloat(item.data.amount);
            const amountLog = Math.log10(amount + 1);
            item.animalSize = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4);
            item.isSmaller = item.animalSize < playerSize;
        });
        
        // Count current distribution
        const smallerCount = this.queue.filter(item => item.isSmaller).length;
        const totalCount = this.queue.length;
        const currentSmallerRatio = totalCount > 0 ? smallerCount / totalCount : 0;
        
        // Sort to maintain desired distribution
        if (currentSmallerRatio < this.sizeDistribution.smallerThanPlayer) {
            this.queue.sort((a, b) => {
                if (a.isSmaller && !b.isSmaller) return -1;
                if (!a.isSmaller && b.isSmaller) return 1;
                return a.timestamp - b.timestamp;
            });
        } else if (currentSmallerRatio > this.sizeDistribution.smallerThanPlayer) {
            this.queue.sort((a, b) => {
                if (!a.isSmaller && b.isSmaller) return -1;
                if (a.isSmaller && !b.isSmaller) return 1;
                return a.timestamp - b.timestamp;
            });
        }
    }
    
    configure(options) {
        if (options.spawnDelay !== undefined) this.spawnDelay = options.spawnDelay;
        if (options.maxQueueSize !== undefined) this.maxQueueSize = options.maxQueueSize;
        if (options.smallerRatio !== undefined) {
            this.sizeDistribution.smallerThanPlayer = options.smallerRatio;
            this.sizeDistribution.largerThanPlayer = 1 - options.smallerRatio;
        }
    }
    
    getStats() {
        return {
            queueLength: this.queue.length,
            spawnDelay: this.spawnDelay,
            maxQueueSize: this.maxQueueSize,
            sizeDistribution: this.sizeDistribution,
            processing: this.processing
        };
    }
    
    clear() {
        this.queue = [];
        this.processing = false;
    }
}

export class EntityManager {
    constructor(sceneManager, gameState) {
        this.sceneManager = sceneManager;
        this.gameState = gameState;
        this.plants = [];
        this.animals = [];
        this.powerUpFruits = [];
        this.leverageFruits = [];
        this.speedrunFruits = [];
        
        // Initialize spawn queue
        this.spawnQueue = new SpawnQueue();
        this.spawnQueue.onSpawnCallback = (data) => this.spawnFromQueue(data);
        
        // Track active animals count
        this.maxAnimals = 50;
    }
    
    addPlant(transactionData) {
        // Limit plants to prevent performance issues
        if (this.plants.length >= CONFIG.MAX_PLANTS) {
            // Remove oldest plants
            const toRemove = this.plants.splice(0, CONFIG.REMOVE_BATCH_SIZE);
            toRemove.forEach(plant => {
                this.sceneManager.removeFromScene(plant.mesh);
            });
        }
        
        // Create plant based on transaction
        const plant = this.createPlant(transactionData);
        this.plants.push(plant);
        this.sceneManager.addToScene(plant.mesh);
        this.gameState.updateStats('currentPlants', 1);
    }
    
    addAnimal(transactionData) {
        // Check if we're at max capacity
        if (this.animals.length >= this.maxAnimals) {
            // Remove oldest animals
            const toRemove = this.animals.splice(0, 5);
            toRemove.forEach(animal => {
                this.sceneManager.removeFromScene(animal.mesh);
                this.gameState.updateStats('currentAnimals', -1);
            });
        }
        
        const animal = this.createAnimal(transactionData);
        this.animals.push(animal);
        this.sceneManager.addToScene(animal.mesh);
        this.gameState.updateStats('currentAnimals', 1);
    }
    
    spawnFromQueue(transactionData) {
        // Decide whether to spawn as plant or animal based on amount
        const amount = parseFloat(transactionData.amount);
        
        if (amount > 1000) {
            this.addPlant(transactionData);
        } else {
            this.addAnimal(transactionData);
        }
    }
    
    queueTransaction(transactionData) {
        // Add to spawn queue for controlled spawning
        this.spawnQueue.enqueue(transactionData);
    }
    
    createPlant(data) {
        const amount = parseFloat(data.amount);
        const targetHeight = Math.min(Math.max(Math.log10(amount + 1) * 5 + 2, 2), 30);
        const stemWidth = Math.min(Math.max(Math.log10(amount + 1) * 0.3 + 0.1, 0.1), 2);
        
        // Create plant group
        const plantGroup = new THREE.Group();
        
        // Different plant types based on amount
        let plantType;
        if (amount < 5000) {
            plantType = 'flower';
        } else if (amount < 20000) {
            plantType = 'bush';
        } else if (amount < 50000) {
            plantType = 'tree';
        } else {
            plantType = 'giant_tree';
        }
        
        // Create stem/trunk
        const stemGeometry = new THREE.CylinderGeometry(
            stemWidth * 0.8, 
            stemWidth, 
            targetHeight,
            8,
            4
        );
        const stemMaterial = new THREE.MeshLambertMaterial({
            color: 0x2D5016 // Dark green stem
        });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = targetHeight / 2;
        stem.castShadow = true;
        plantGroup.add(stem);
        
        // Add foliage based on plant type
        if (plantType === 'flower') {
            // Add flower petals
            const petalCount = 5 + Math.floor(Math.random() * 3);
            for (let i = 0; i < petalCount; i++) {
                const angle = (i / petalCount) * Math.PI * 2;
                const petalGeometry = new THREE.SphereGeometry(stemWidth * 2, 6, 4);
                const petalMaterial = new THREE.MeshPhongMaterial({
                    color: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0xFFFFFF,
                    emissive: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0xFFFFFF,
                    emissiveIntensity: 0.2
                });
                const petal = new THREE.Mesh(petalGeometry, petalMaterial);
                petal.position.set(
                    Math.cos(angle) * stemWidth * 3,
                    targetHeight,
                    Math.sin(angle) * stemWidth * 3
                );
                petal.scale.set(1.5, 0.7, 1);
                plantGroup.add(petal);
            }
        } else if (plantType === 'bush' || plantType === 'tree' || plantType === 'giant_tree') {
            // Add tree crown
            const crownSize = targetHeight * 0.6;
            const crownGeometry = new THREE.SphereGeometry(crownSize, 8, 6);
            const crownMaterial = new THREE.MeshLambertMaterial({
                color: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0x228B22
            });
            const crown = new THREE.Mesh(crownGeometry, crownMaterial);
            crown.position.y = targetHeight + crownSize * 0.5;
            crown.castShadow = true;
            plantGroup.add(crown);
            
            // Add additional foliage layers for giant trees
            if (plantType === 'giant_tree') {
                for (let i = 0; i < 3; i++) {
                    const layerGeometry = new THREE.SphereGeometry(crownSize * (0.8 - i * 0.2), 6, 4);
                    const layer = new THREE.Mesh(layerGeometry, crownMaterial);
                    layer.position.y = targetHeight + crownSize * (0.3 + i * 0.3);
                    layer.position.x = (Math.random() - 0.5) * crownSize * 0.5;
                    layer.position.z = (Math.random() - 0.5) * crownSize * 0.5;
                    plantGroup.add(layer);
                }
            }
        }
        
        // Random position
        plantGroup.position.x = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        plantGroup.position.y = -30;
        plantGroup.position.z = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        
        // Start small for growth animation
        plantGroup.scale.set(0.01, 0.01, 0.01);
        
        return {
            mesh: plantGroup,
            data,
            age: 0,
            growthProgress: 0,
            targetScale: 1,
            swayPhase: Math.random() * Math.PI * 2,
            plantType
        };
    }
    
    createAnimal(data) {
        const amount = parseFloat(data.amount);
        const size = Math.min(Math.max(Math.log10(amount + 1) * 0.5, 0.5), 5);
        
        const geometry = new THREE.SphereGeometry(size, 12, 8);
        const material = new THREE.MeshPhongMaterial({
            color: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0xFFFFFF,
            emissive: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0xFFFFFF,
            emissiveIntensity: 0.2
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Spawn at safe distance from player
        const angle = Math.random() * Math.PI * 2;
        const distance = 25 + Math.random() * 30;
        mesh.position.x = Math.cos(angle) * distance;
        mesh.position.y = size;
        mesh.position.z = Math.sin(angle) * distance;
        mesh.castShadow = true;
        
        return {
            mesh,
            data,
            size,
            speed: Math.random() * 2 + 0.5,
            direction: Math.random() * Math.PI * 2,
            isAlive: true,
            behaviorState: 'wandering'
        };
    }
    
    spawnPowerUpFruit() {
        if (this.powerUpFruits.length >= CONFIG.POWER_UP.MAX_FRUITS) return;
        
        const geometry = new THREE.SphereGeometry(1.5, 12, 8);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFF69B4, // Hot pink
            emissive: 0xFF1493,
            emissiveIntensity: 0.5
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Random position
        mesh.position.x = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        mesh.position.y = 1.5;
        mesh.position.z = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        
        const fruit = {
            mesh,
            type: 'life',
            createdAt: Date.now()
        };
        
        this.powerUpFruits.push(fruit);
        this.sceneManager.addToScene(mesh);
    }
    
    update(deltaTime, playerController) {
        // Update plants with growth and animation
        this.plants.forEach(plant => {
            // Growth animation
            if (plant.growthProgress < 1) {
                plant.growthProgress += deltaTime * 0.3;
                const scale = plant.growthProgress * plant.targetScale;
                plant.mesh.scale.set(scale, scale, scale);
            }
            
            // Gentle swaying animation
            const swayTime = Date.now() * 0.001;
            const swayAmount = plant.plantType === 'flower' ? 0.1 : 0.05;
            plant.mesh.rotation.z = Math.sin(swayTime + plant.swayPhase) * swayAmount;
            plant.mesh.rotation.x = Math.sin(swayTime * 0.7 + plant.swayPhase) * swayAmount * 0.5;
            
            // Rotate flowers slowly
            if (plant.plantType === 'flower') {
                plant.mesh.rotation.y += deltaTime * 0.2;
            }
        });
        
        // Update animals
        this.animals = this.animals.filter(animal => {
            if (!animal.isAlive) {
                this.sceneManager.removeFromScene(animal.mesh);
                this.gameState.updateStats('currentAnimals', -1);
                return false;
            }
            
            // Update animal behavior
            this.updateAnimalBehavior(animal, deltaTime, playerController);
            
            // Move animal
            animal.mesh.position.x += Math.cos(animal.direction) * animal.speed * deltaTime;
            animal.mesh.position.z += Math.sin(animal.direction) * animal.speed * deltaTime;
            
            // Keep in bounds
            const distance = Math.sqrt(
                animal.mesh.position.x ** 2 + 
                animal.mesh.position.z ** 2
            );
            
            if (distance > CONFIG.GARDEN_RADIUS - 5) {
                animal.direction += Math.PI;
            }
            
            // Bob up and down
            animal.mesh.position.y = animal.size + Math.sin(Date.now() * 0.003) * 0.2;
            
            return true;
        });
        
        // Update power-up fruits
        this.powerUpFruits = this.powerUpFruits.filter(fruit => {
            // Remove old fruits
            if (Date.now() - fruit.createdAt > CONFIG.POWER_UP.LIFETIME) {
                this.sceneManager.removeFromScene(fruit.mesh);
                return false;
            }
            
            // Rotate and pulse
            fruit.mesh.rotation.y += deltaTime * 2;
            const scale = 1 + Math.sin(Date.now() * 0.005) * 0.2;
            fruit.mesh.scale.setScalar(scale);
            
            return true;
        });
        
        // Spawn new power-ups periodically
        if (Math.random() < 0.001) {
            this.spawnPowerUpFruit();
        }
    }
    
    updateAnimalBehavior(animal, deltaTime, playerController) {
        if (!playerController.controls.isPlaying || !playerController.controls.mesh) {
            animal.behaviorState = 'wandering';
            animal.speed = animal.baseSpeed || 1;
            return;
        }
        
        const playerPos = playerController.controls.mesh.position;
        const animalPos = animal.mesh.position;
        const distance = playerPos.distanceTo(animalPos);
        const sizeRatio = animal.size / playerController.controls.size;
        
        // Initialize animal properties if not set
        if (!animal.baseSpeed) animal.baseSpeed = 1 + Math.random();
        if (!animal.detectionRange) animal.detectionRange = 25;
        if (!animal.fleeRange) animal.fleeRange = 20;
        if (!animal.chaseRange) animal.chaseRange = 20;
        
        // Outside detection range - wander
        if (distance > animal.detectionRange) {
            if (animal.behaviorState !== 'wandering') {
                animal.behaviorState = 'wandering';
                animal.speed = animal.baseSpeed;
            }
            animal.direction += (Math.random() - 0.5) * 0.1;
            return;
        }
        
        // PREY BEHAVIOR - Flee from larger player
        if (sizeRatio < 0.8 && distance < animal.fleeRange) {
            if (animal.behaviorState !== 'fleeing') {
                animal.behaviorState = 'fleeing';
            }
            
            // Smart fleeing with zigzag
            const fleeDirection = animalPos.clone().sub(playerPos).normalize();
            const zigzag = Math.sin(Date.now() * 0.003) * 0.3;
            animal.direction = Math.atan2(fleeDirection.z, fleeDirection.x) + zigzag;
            
            // Panic speed based on proximity
            const panicFactor = 1 - (distance / animal.fleeRange);
            animal.speed = animal.baseSpeed * 1.5 * (1 + panicFactor * 0.2);
        }
        // PREDATOR BEHAVIOR - Chase smaller player
        else if (sizeRatio > 1.2 && distance < animal.chaseRange) {
            // Reduce aggression for much larger animals
            let adjustedChaseRange = animal.chaseRange;
            if (sizeRatio > 1.5) {
                const rangeMultiplier = Math.max(0.1, 0.75 - (sizeRatio - 1.5) * 0.3);
                adjustedChaseRange = animal.chaseRange * rangeMultiplier;
            }
            
            if (distance < adjustedChaseRange) {
                if (animal.behaviorState !== 'chasing') {
                    animal.behaviorState = 'chasing';
                }
                
                // Predictive chasing
                const playerVelocity = playerController.controls.velocity;
                const predictTime = distance / (animal.baseSpeed * 2);
                const predictedPos = playerPos.clone();
                predictedPos.add(playerVelocity.clone().multiplyScalar(predictTime * 0.3));
                
                const chaseDirection = predictedPos.clone().sub(animalPos).normalize();
                animal.direction = Math.atan2(chaseDirection.z, chaseDirection.x);
                
                // Slower chase for much larger animals
                let chaseSpeed = animal.baseSpeed * 2;
                if (sizeRatio > 1.5) {
                    const speedMultiplier = Math.max(0.2, 1.0 - (sizeRatio - 1.5) * 0.4);
                    chaseSpeed = chaseSpeed * speedMultiplier;
                }
                animal.speed = chaseSpeed;
            }
        }
        // NEUTRAL - Return to wandering
        else {
            if (animal.behaviorState !== 'wandering') {
                // Smooth transition back to wandering
                animal.speed = animal.speed * 0.9 + animal.baseSpeed * 0.1;
                if (Math.abs(animal.speed - animal.baseSpeed) < 0.1) {
                    animal.behaviorState = 'wandering';
                    animal.speed = animal.baseSpeed;
                }
            }
            animal.direction += (Math.random() - 0.5) * 0.1;
        }
        
        // Alliance mode - animals team up when threatened
        if (this.gameState.difficultyLevel === 'alliance' && sizeRatio < 0.5) {
            this.handleAllianceBehavior(animal, playerController);
        }
        
        // Survival mode - animals hunt each other
        if (this.gameState.difficultyLevel === 'survival') {
            this.handleSurvivalBehavior(animal);
        }
    }
    
    handleAllianceBehavior(animal, playerController) {
        // Find nearby animals to team up with
        const allies = this.animals.filter(other => {
            if (other === animal || !other.isAlive) return false;
            const distance = animal.mesh.position.distanceTo(other.mesh.position);
            return distance < 15 && other.size / playerController.controls.size < 0.8;
        });
        
        if (allies.length > 0) {
            // Move toward center of ally group
            const centerPos = new THREE.Vector3();
            allies.forEach(ally => {
                centerPos.add(ally.mesh.position);
            });
            centerPos.divideScalar(allies.length);
            
            const groupDirection = centerPos.clone().sub(animal.mesh.position).normalize();
            animal.direction = Math.atan2(groupDirection.z, groupDirection.x);
            animal.speed = animal.baseSpeed * 1.2;
        }
    }
    
    handleSurvivalBehavior(animal) {
        // Look for smaller animals to hunt
        if (!animal.targetAnimal || !animal.targetAnimal.isAlive) {
            const prey = this.animals.find(other => {
                if (other === animal || !other.isAlive) return false;
                const distance = animal.mesh.position.distanceTo(other.mesh.position);
                return distance < 20 && other.size < animal.size * 0.8;
            });
            
            if (prey) {
                animal.targetAnimal = prey;
                animal.aiState = 'hunting';
            }
        }
        
        // Hunt the target
        if (animal.targetAnimal && animal.targetAnimal.isAlive) {
            const targetPos = animal.targetAnimal.mesh.position;
            const distance = animal.mesh.position.distanceTo(targetPos);
            
            if (distance < animal.size + animal.targetAnimal.size) {
                // Eat the prey
                animal.targetAnimal.isAlive = false;
                animal.size *= 1.1;
                animal.mesh.scale.setScalar(animal.size);
                animal.targetAnimal = null;
                animal.aiState = 'roaming';
            } else {
                // Chase the prey
                const chaseDirection = targetPos.clone().sub(animal.mesh.position).normalize();
                animal.direction = Math.atan2(chaseDirection.z, chaseDirection.x);
                animal.speed = animal.baseSpeed * 1.5;
            }
        }
    }
    
    checkPlayerCollisions(playerController) {
        if (!playerController.controls.mesh) return null;
        
        const playerPos = playerController.controls.mesh.position;
        const playerSize = playerController.controls.size;
        
        // Check animal collisions
        for (let animal of this.animals) {
            if (!animal.isAlive) continue;
            
            const distance = playerPos.distanceTo(animal.mesh.position);
            const collisionDistance = playerSize + animal.size;
            
            if (distance < collisionDistance) {
                const sizeRatio = animal.size / playerSize;
                
                if (sizeRatio < 1.2) {
                    // Player eats animal
                    animal.isAlive = false;
                    return {
                        type: 'eat',
                        value: animal.size * 10,
                        sizeGain: animal.size * 0.1
                    };
                } else if (sizeRatio > 1.2) {
                    // Animal eats player
                    return {
                        type: 'death'
                    };
                }
            }
        }
        
        // Check power-up collisions
        for (let i = 0; i < this.powerUpFruits.length; i++) {
            const fruit = this.powerUpFruits[i];
            const distance = playerPos.distanceTo(fruit.mesh.position);
            
            if (distance < playerSize + 1.5) {
                this.sceneManager.removeFromScene(fruit.mesh);
                this.powerUpFruits.splice(i, 1);
                return {
                    type: 'powerup',
                    powerupType: fruit.type
                };
            }
        }
        
        return null;
    }
    
    clearAll() {
        // Clear plants
        this.plants.forEach(plant => {
            this.sceneManager.removeFromScene(plant.mesh);
        });
        this.plants = [];
        
        // Clear animals
        this.animals.forEach(animal => {
            this.sceneManager.removeFromScene(animal.mesh);
        });
        this.animals = [];
        
        // Clear power-ups
        this.powerUpFruits.forEach(fruit => {
            this.sceneManager.removeFromScene(fruit.mesh);
        });
        this.powerUpFruits = [];
        
        // Reset stats
        this.gameState.stats.currentPlants = 0;
        this.gameState.stats.currentAnimals = 0;
    }
}