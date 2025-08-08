import { CONFIG } from './config.js';

export class PlayerController {
    constructor() {
        this.controls = {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false,
            rotateLeft: false,
            rotateRight: false,
            boost: false,
            velocity: new THREE.Vector3(),
            rotation: 0,
            rotationSpeed: CONFIG.PLAYER.ROTATION_SPEED,
            mouseX: 0,
            mouseY: 0,
            isPlaying: false,
            size: CONFIG.PLAYER.INITIAL_SIZE,
            mesh: null,
            speed: CONFIG.PLAYER.BASE_SPEED
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }
    
    onKeyDown(event) {
        if (!this.controls.isPlaying) return;
        
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.controls.moveForward = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.controls.moveBackward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.controls.moveLeft = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.controls.moveRight = true;
                break;
            case 'KeyQ':
                this.controls.rotateLeft = true;
                break;
            case 'KeyE':
                this.controls.rotateRight = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.controls.boost = true;
                break;
        }
    }
    
    onKeyUp(event) {
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.controls.moveForward = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.controls.moveBackward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.controls.moveLeft = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.controls.moveRight = false;
                break;
            case 'KeyQ':
                this.controls.rotateLeft = false;
                break;
            case 'KeyE':
                this.controls.rotateRight = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.controls.boost = false;
                break;
        }
    }
    
    onMouseMove(event) {
        if (!this.controls.isPlaying) return;
        
        this.controls.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        this.controls.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    
    update(deltaTime, camera) {
        if (!this.controls.mesh || !this.controls.isPlaying) return;
        
        // Update rotation
        if (this.controls.rotateLeft) {
            this.controls.rotation += this.controls.rotationSpeed;
        }
        if (this.controls.rotateRight) {
            this.controls.rotation -= this.controls.rotationSpeed;
        }
        
        // Calculate movement direction
        const moveDirection = new THREE.Vector3();
        
        if (this.controls.moveForward) {
            moveDirection.z = 1;
        }
        if (this.controls.moveBackward) {
            moveDirection.z = -1;
        }
        if (this.controls.moveLeft) {
            moveDirection.x = -1;
        }
        if (this.controls.moveRight) {
            moveDirection.x = 1;
        }
        
        moveDirection.normalize();
        moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.controls.rotation);
        
        // Apply movement with speed
        const speed = this.controls.boost ? this.controls.speed * 1.5 : this.controls.speed;
        this.controls.velocity.lerp(moveDirection.multiplyScalar(speed), 0.1);
        
        // Update position
        this.controls.mesh.position.add(
            this.controls.velocity.clone().multiplyScalar(deltaTime)
        );
        
        // Keep player in bounds
        const maxDistance = CONFIG.GARDEN_RADIUS - 5;
        if (this.controls.mesh.position.length() > maxDistance) {
            this.controls.mesh.position.normalize().multiplyScalar(maxDistance);
        }
        
        // Update mesh rotation
        this.controls.mesh.rotation.y = this.controls.rotation;
        
        // Update camera to follow player
        if (camera) {
            const cameraOffset = new THREE.Vector3(0, 20, -30);
            cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.controls.rotation);
            camera.position.lerp(
                this.controls.mesh.position.clone().add(cameraOffset),
                0.1
            );
            camera.lookAt(this.controls.mesh.position);
        }
    }
    
    setSize(newSize) {
        this.controls.size = newSize;
        if (this.controls.mesh) {
            this.controls.mesh.scale.setScalar(newSize);
        }
    }
    
    reset() {
        this.controls.velocity.set(0, 0, 0);
        this.controls.rotation = 0;
        this.controls.size = CONFIG.PLAYER.INITIAL_SIZE;
        this.controls.speed = CONFIG.PLAYER.BASE_SPEED;
        
        if (this.controls.mesh) {
            this.controls.mesh.position.set(0, 0, 0);
            this.controls.mesh.scale.setScalar(CONFIG.PLAYER.INITIAL_SIZE);
        }
    }
}