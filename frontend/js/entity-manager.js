import { CONFIG } from './config.js';

export class EntityManager {
    constructor(sceneManager, gameState) {
        this.sceneManager = sceneManager;
        this.gameState = gameState;
        this.plants = [];
        this.animals = [];
        this.powerUpFruits = [];
        this.leverageFruits = [];
        this.speedrunFruits = [];
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
        const animal = this.createAnimal(transactionData);
        this.animals.push(animal);
        this.sceneManager.addToScene(animal.mesh);
        this.gameState.updateStats('currentAnimals', 1);
    }
    
    createPlant(data) {
        const amount = parseFloat(data.amount);
        const height = Math.min(Math.max(Math.log10(amount + 1) * 5 + 2, 2), 30);
        
        const geometry = new THREE.CylinderGeometry(0.5, 1, height, 8);
        const material = new THREE.MeshLambertMaterial({
            color: CONFIG.STABLECOIN_COLORS[data.stablecoin] || 0xFFFFFF
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        mesh.position.y = height / 2 - 30;
        mesh.position.z = (Math.random() - 0.5) * CONFIG.GARDEN_RADIUS * 1.5;
        mesh.castShadow = true;
        
        return {
            mesh,
            data,
            age: 0,
            growthProgress: 0
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
        // Update plants
        this.plants.forEach(plant => {
            if (plant.growthProgress < 1) {
                plant.growthProgress += deltaTime * 0.2;
                plant.mesh.scale.y = plant.growthProgress;
            }
            
            // Gentle sway
            plant.mesh.rotation.z = Math.sin(Date.now() * 0.001 + plant.mesh.position.x) * 0.05;
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
            return;
        }
        
        const playerPos = playerController.controls.mesh.position;
        const animalPos = animal.mesh.position;
        const distance = playerPos.distanceTo(animalPos);
        
        const sizeRatio = animal.size / playerController.controls.size;
        
        // Flee from larger player
        if (sizeRatio < 0.8 && distance < 20) {
            animal.behaviorState = 'fleeing';
            const fleeDirection = animalPos.clone().sub(playerPos).normalize();
            animal.direction = Math.atan2(fleeDirection.z, fleeDirection.x);
            animal.speed = 3;
        }
        // Chase smaller player
        else if (sizeRatio > 1.2 && distance < 30) {
            animal.behaviorState = 'chasing';
            const chaseDirection = playerPos.clone().sub(animalPos).normalize();
            animal.direction = Math.atan2(chaseDirection.z, chaseDirection.x);
            animal.speed = 2;
        }
        // Wander
        else {
            animal.behaviorState = 'wandering';
            animal.direction += (Math.random() - 0.5) * 0.1;
            animal.speed = 1;
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