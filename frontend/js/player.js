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
        
        // Mobile controls
        this.isMobile = this.detectMobile();
        this.touchStartPos = null;
        this.touchCurrentPos = null;
        this.touchJoystick = {
            active: false,
            baseX: 0,
            baseY: 0,
            stickX: 0,
            stickY: 0
        };
        
        this.setupEventListeners();
        if (this.isMobile) {
            this.setupMobileControls();
        }
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0);
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }
    
    setupMobileControls() {
        // Touch events for mobile
        document.addEventListener('touchstart', (e) => this.onTouchStart(e));
        document.addEventListener('touchmove', (e) => this.onTouchMove(e));
        document.addEventListener('touchend', (e) => this.onTouchEnd(e));
        
        // Create virtual joystick UI
        this.createVirtualJoystick();
    }
    
    createVirtualJoystick() {
        // Create joystick container
        const joystickContainer = document.createElement('div');
        joystickContainer.id = 'virtual-joystick';
        joystickContainer.style.cssText = `
            position: fixed;
            bottom: 50px;
            left: 50px;
            width: 150px;
            height: 150px;
            z-index: 1000;
            opacity: 0.7;
            display: none;
        `;
        
        // Joystick base
        const joystickBase = document.createElement('div');
        joystickBase.style.cssText = `
            position: absolute;
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            border: 3px solid rgba(255, 255, 255, 0.5);
        `;
        
        // Joystick stick
        const joystickStick = document.createElement('div');
        joystickStick.id = 'joystick-stick';
        joystickStick.style.cssText = `
            position: absolute;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.7);
            left: 45px;
            top: 45px;
            transition: none;
        `;
        
        joystickContainer.appendChild(joystickBase);
        joystickContainer.appendChild(joystickStick);
        document.body.appendChild(joystickContainer);
        
        this.joystickElement = joystickContainer;
        this.joystickStick = joystickStick;
    }
    
    onTouchStart(event) {
        if (!this.controls.isPlaying) return;
        
        const touch = event.touches[0];
        this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        this.touchCurrentPos = { x: touch.clientX, y: touch.clientY };
        
        // Show joystick at touch position if on left side of screen
        if (touch.clientX < window.innerWidth / 2) {
            this.touchJoystick.active = true;
            this.touchJoystick.baseX = touch.clientX;
            this.touchJoystick.baseY = touch.clientY;
            
            if (this.joystickElement) {
                this.joystickElement.style.display = 'block';
                this.joystickElement.style.left = (touch.clientX - 75) + 'px';
                this.joystickElement.style.top = (touch.clientY - 75) + 'px';
            }
        }
        
        event.preventDefault();
    }
    
    onTouchMove(event) {
        if (!this.controls.isPlaying || !this.touchJoystick.active) return;
        
        const touch = event.touches[0];
        this.touchCurrentPos = { x: touch.clientX, y: touch.clientY };
        
        // Calculate joystick offset
        const deltaX = touch.clientX - this.touchJoystick.baseX;
        const deltaY = touch.clientY - this.touchJoystick.baseY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = 60;
        
        // Limit stick movement
        let stickX = deltaX;
        let stickY = deltaY;
        if (distance > maxDistance) {
            stickX = (deltaX / distance) * maxDistance;
            stickY = (deltaY / distance) * maxDistance;
        }
        
        this.touchJoystick.stickX = stickX / maxDistance;
        this.touchJoystick.stickY = stickY / maxDistance;
        
        // Update visual joystick
        if (this.joystickStick) {
            this.joystickStick.style.left = (45 + stickX) + 'px';
            this.joystickStick.style.top = (45 + stickY) + 'px';
        }
        
        // Update movement controls based on joystick
        this.controls.moveForward = this.touchJoystick.stickY < -0.3;
        this.controls.moveBackward = this.touchJoystick.stickY > 0.3;
        this.controls.moveLeft = this.touchJoystick.stickX < -0.3;
        this.controls.moveRight = this.touchJoystick.stickX > 0.3;
        
        event.preventDefault();
    }
    
    onTouchEnd(event) {
        this.touchJoystick.active = false;
        this.touchJoystick.stickX = 0;
        this.touchJoystick.stickY = 0;
        
        // Reset controls
        this.controls.moveForward = false;
        this.controls.moveBackward = false;
        this.controls.moveLeft = false;
        this.controls.moveRight = false;
        
        // Hide joystick
        if (this.joystickElement) {
            this.joystickElement.style.display = 'none';
        }
        
        // Reset stick position
        if (this.joystickStick) {
            this.joystickStick.style.left = '45px';
            this.joystickStick.style.top = '45px';
        }
        
        event.preventDefault();
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