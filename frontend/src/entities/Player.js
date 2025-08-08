import * as THREE from 'three';
import { EventBus, GameEvents } from '../core/EventBus.js';
import Config from '../core/Config.js';
import GameState from '../core/GameState.js';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        // Core properties
        this.size = Config.player.startSize;
        this.baseSpeed = Config.player.baseSpeed;
        this.rotationSpeed = Config.player.rotationSpeed;
        this.rotation = 0;
        
        // Movement state
        this.velocity = new THREE.Vector3();
        this.position = new THREE.Vector3(0, -30, 0);
        
        // Controls
        this.controls = {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false,
            rotateLeft: false,
            rotateRight: false,
            boost: false,
            mouseX: 0,
            mouseY: 0
        };
        
        // Mobile controls
        this.mobileMovement = {
            active: false,
            angle: 0,
            magnitude: 0
        };
        
        // Game state
        this.isPlaying = false;
        this.mesh = null;
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Create the player mesh
        this.create();
    }
    
    setupEventListeners() {
        // Power-up effects
        EventBus.on(GameEvents.POWERUP_ACTIVATED, (data) => {
            if (data.type === 'leverage') {
                this.updateSizeWithLeverage();
            } else if (data.type === 'speedrun') {
                this.baseSpeed = Config.player.baseSpeed * data.multiplier;
            }
        });
        
        EventBus.on(GameEvents.POWERUP_DEACTIVATED, (data) => {
            if (data.type === 'leverage') {
                this.updateSizeWithLeverage();
            } else if (data.type === 'speedrun') {
                this.baseSpeed = Config.player.baseSpeed;
            }
        });
        
        // Game state changes
        EventBus.on(GameEvents.GAME_START, () => {
            this.spawn();
        });
        
        EventBus.on(GameEvents.PLAYER_RESPAWN, () => {
            this.respawn();
        });
        
        // Collision results
        EventBus.on(GameEvents.COLLISION_PLAYER_ANIMAL, (data) => {
            if (data.playerEaten) {
                this.die();
            } else if (data.animalEaten) {
                this.grow(data.growthAmount);
            }
        });
        
        EventBus.on(GameEvents.COLLISION_PLAYER_POWERUP, (data) => {
            // Power-up collection is handled by GameState
        });
    }
    
    create() {
        if (this.mesh) {
            this.dispose();
        }
        
        // Create player as a special colored animal
        const playerGroup = new THREE.Group();
        
        // Body (sphere that will grow)
        const bodyGeometry = new THREE.SphereGeometry(this.size, 8, 6);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x9B59B6, // Purple for player
            emissive: 0x9B59B6,
            emissiveIntensity: 0.2
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.size;
        body.castShadow = true;
        playerGroup.add(body);
        
        // Eyes to show direction
        for (let i = -1; i <= 1; i += 2) {
            const eyeGeometry = new THREE.SphereGeometry(this.size * 0.15, 4, 4);
            const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(
                this.size * 0.6, 
                this.size * 1.2, 
                i * this.size * 0.3
            );
            playerGroup.add(eye);
            
            // Pupils
            const pupilGeometry = new THREE.SphereGeometry(this.size * 0.08, 4, 4);
            const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            pupil.position.set(
                this.size * 0.7, 
                this.size * 1.2, 
                i * this.size * 0.3
            );
            playerGroup.add(pupil);
        }
        
        this.mesh = playerGroup;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // Store body reference for easy access
        this.body = body;
    }
    
    spawn() {
        this.isPlaying = true;
        this.size = Config.player.startSize;
        this.position.set(0, -30 + this.size, 0);
        
        // Recreate mesh with new size
        this.create();
        
        // Update camera
        this.updateCamera();
        
        EventBus.emit(GameEvents.PLAYER_SPAWN, {
            position: this.position.clone(),
            size: this.size
        });
    }
    
    respawn() {
        // Reset position to center
        this.position.set(0, -30 + this.size, 0);
        
        if (this.mesh) {
            this.mesh.position.copy(this.position);
        }
        
        // Make player invulnerable for a short time
        this.invulnerable = true;
        setTimeout(() => {
            this.invulnerable = false;
        }, 2000);
        
        EventBus.emit(GameEvents.PLAYER_RESPAWN, {
            position: this.position.clone(),
            size: this.size
        });
    }
    
    update(deltaTime) {
        if (!this.isPlaying || !this.mesh) return;
        
        // Update movement
        this.updateMovement(deltaTime);
        
        // Update camera to follow player
        this.updateCamera();
        
        // Update velocity for tracking
        this.velocity.copy(this.mesh.position).sub(this.position);
        this.position.copy(this.mesh.position);
    }
    
    updateMovement(delta) {
        // Calculate effective speed
        const speed = this.baseSpeed * (1 + this.size * 0.1); // Bigger = slightly faster
        
        // Calculate movement direction based on camera
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        
        // Apply movement
        const moveVector = new THREE.Vector3();
        
        // Check if using mobile controls
        const isMobile = this.mobileMovement && this.mobileMovement.active;
        
        if (isMobile) {
            // Mobile: Use omnidirectional movement
            const angle = this.mobileMovement.angle;
            const magnitude = this.mobileMovement.magnitude;
            
            if (magnitude > 0) {
                const touchX = Math.cos(angle) * magnitude;
                const touchY = Math.sin(angle) * magnitude;
                
                moveVector.add(right.clone().multiplyScalar(touchX));
                moveVector.add(forward.clone().multiplyScalar(touchY));
            }
        } else {
            // Desktop: Traditional keyboard movement
            if (this.controls.moveForward) moveVector.add(forward);
            if (this.controls.moveBackward) moveVector.sub(forward);
            if (this.controls.moveLeft) moveVector.sub(right);
            if (this.controls.moveRight) moveVector.add(right);
        }
        
        // Handle rotation
        if (this.controls.rotateLeft) {
            this.rotation -= this.rotationSpeed;
        }
        if (this.controls.rotateRight) {
            this.rotation += this.rotationSpeed;
        }
        
        if (moveVector.length() > 0) {
            moveVector.normalize();
            moveVector.multiplyScalar(speed * delta);
            
            // Apply boost
            if (this.controls.boost) {
                moveVector.multiplyScalar(2);
            }
            
            // Update position
            this.mesh.position.add(moveVector);
            
            // Keep player on ground
            this.mesh.position.y = this.size * 0.5 - 30;
            
            // Rotate to face movement direction
            if (moveVector.length() > 0.01) {
                const targetRotation = Math.atan2(moveVector.x, moveVector.z);
                this.mesh.rotation.y = targetRotation;
            }
            
            EventBus.emit(GameEvents.PLAYER_MOVE, {
                position: this.mesh.position.clone(),
                velocity: moveVector
            });
        }
        
        // Keep player in bounds
        const boundary = Config.garden.radius + 15;
        this.mesh.position.x = Math.max(-boundary, Math.min(boundary, this.mesh.position.x));
        this.mesh.position.z = Math.max(-boundary, Math.min(boundary, this.mesh.position.z));
    }
    
    updateCamera() {
        if (!this.mesh) return;
        
        // Third person camera following player
        const cameraDistance = 30 + this.size * 5;
        const cameraHeight = 15 + this.size * 3;
        
        const targetX = this.mesh.position.x - Math.sin(this.rotation) * cameraDistance;
        const targetY = this.mesh.position.y + cameraHeight;
        const targetZ = this.mesh.position.z - Math.cos(this.rotation) * cameraDistance;
        
        // Smooth camera movement
        const followSpeed = Config.camera.followSpeed;
        this.camera.position.x += (targetX - this.camera.position.x) * followSpeed;
        this.camera.position.y += (targetY - this.camera.position.y) * followSpeed;
        this.camera.position.z += (targetZ - this.camera.position.z) * followSpeed;
        
        this.camera.lookAt(this.mesh.position);
        
        EventBus.emit(GameEvents.CAMERA_UPDATE, {
            position: this.camera.position.clone(),
            target: this.mesh.position.clone()
        });
    }
    
    grow(amount = 0.1) {
        const oldSize = this.size;
        this.size *= (1 + amount);
        
        // Limit maximum size
        this.size = Math.min(this.size, 20);
        
        // Update mesh scale
        const scale = this.size / oldSize;
        this.mesh.scale.multiplyScalar(scale);
        
        // Update position to keep on ground
        this.mesh.position.y = this.size * 0.5 - 30;
        
        EventBus.emit(GameEvents.PLAYER_GROW, {
            oldSize,
            newSize: this.size,
            scale
        });
    }
    
    shrink(amount = 0.1) {
        const oldSize = this.size;
        this.size *= (1 - amount);
        
        // Limit minimum size
        this.size = Math.max(this.size, 0.5);
        
        // Update mesh scale
        const scale = this.size / oldSize;
        this.mesh.scale.multiplyScalar(scale);
        
        // Update position to keep on ground
        this.mesh.position.y = this.size * 0.5 - 30;
        
        EventBus.emit(GameEvents.PLAYER_SHRINK, {
            oldSize,
            newSize: this.size,
            scale
        });
    }
    
    updateSizeWithLeverage() {
        const leverageMultiplier = GameState.leverageMultiplier;
        
        // Visual effect to show leverage
        if (leverageMultiplier > 1) {
            this.body.material.emissiveIntensity = 0.4;
            this.body.material.emissive = new THREE.Color(0xFFD700); // Golden glow
        } else {
            this.body.material.emissiveIntensity = 0.2;
            this.body.material.emissive = new THREE.Color(0x9B59B6); // Back to purple
        }
    }
    
    die() {
        if (this.invulnerable) return;
        
        this.isPlaying = false;
        
        // Death animation
        if (this.mesh) {
            // Shrink and fade out
            const deathDuration = 1000;
            const startTime = Date.now();
            
            const animateDeath = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / deathDuration, 1);
                
                this.mesh.scale.setScalar(this.size * (1 - progress));
                this.mesh.rotation.y += 0.1;
                
                if (progress < 1) {
                    requestAnimationFrame(animateDeath);
                } else {
                    this.dispose();
                }
            };
            
            animateDeath();
        }
        
        EventBus.emit(GameEvents.PLAYER_DIE, {
            position: this.position.clone(),
            size: this.size
        });
    }
    
    setControls(newControls) {
        Object.assign(this.controls, newControls);
    }
    
    setMobileMovement(movement) {
        this.mobileMovement = movement;
    }
    
    getEffectiveSize() {
        return this.size * GameState.leverageMultiplier;
    }
    
    getBoundingBox() {
        return {
            center: this.position.clone(),
            radius: this.size
        };
    }
    
    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            
            this.mesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            
            this.mesh = null;
        }
    }
}

export default Player;