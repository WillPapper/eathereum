import { EventBus, GameEvents } from './EventBus.js';
import Config from './Config.js';
import GameState from './GameState.js';
import SceneManager from '../rendering/SceneManager.js';
import AssetFactory from '../rendering/AssetFactory.js';
import Player from '../entities/Player.js';

export class GameEngine {
    constructor(container) {
        this.container = container || document.body;
        
        // Core systems
        this.sceneManager = null;
        this.player = null;
        this.systems = [];
        
        // Timing
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        this.elapsedTime = 0;
        this.lastUpdateTime = 0;
        this.targetFPS = 60;
        this.targetFrameTime = 1000 / this.targetFPS;
        
        // Game loop control
        this.isRunning = false;
        this.animationId = null;
        
        // Performance monitoring
        this.frameCount = 0;
        this.fpsUpdateInterval = 1000;
        this.lastFpsUpdate = 0;
        this.currentFPS = 0;
        
        // Error handling
        this.errorCount = 0;
        this.maxErrors = 10;
        
        // Initialize
        this.init();
    }
    
    async init() {
        try {
            // Create scene manager
            this.sceneManager = new SceneManager(this.container);
            
            // Create player
            this.player = new Player(
                this.sceneManager.getScene(),
                this.sceneManager.getCamera()
            );
            
            // Store player in game state
            GameState.setPlayer(this.player);
            
            // Initialize systems (will be added as modules are created)
            await this.initializeSystems();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Setup input handling
            this.setupInputHandling();
            
            console.log('GameEngine initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize GameEngine:', error);
            EventBus.emit(GameEvents.SYSTEM_ERROR, {
                message: 'Failed to initialize game engine',
                error
            });
        }
    }
    
    async initializeSystems() {
        // Systems will be initialized here as they're created
        // For now, we'll add them dynamically when modules are loaded
        
        // Example of how systems will be added:
        // const collisionSystem = new CollisionSystem();
        // this.addSystem(collisionSystem);
        
        // const animalSystem = new AnimalSystem(this.sceneManager.getScene());
        // this.addSystem(animalSystem);
        
        // const plantSystem = new PlantSystem(this.sceneManager.getScene());
        // this.addSystem(plantSystem);
        
        // const powerUpSystem = new PowerUpSystem(this.sceneManager.getScene());
        // this.addSystem(powerUpSystem);
        
        // const uiManager = new UIManager();
        // this.addSystem(uiManager);
    }
    
    addSystem(system) {
        if (system && typeof system.update === 'function') {
            this.systems.push(system);
            console.log(`System added: ${system.constructor.name}`);
        } else {
            console.warn('Invalid system - must have update method');
        }
    }
    
    removeSystem(system) {
        const index = this.systems.indexOf(system);
        if (index !== -1) {
            this.systems.splice(index, 1);
            if (system.dispose) {
                system.dispose();
            }
        }
    }
    
    setupEventListeners() {
        // Game state events
        EventBus.on(GameEvents.GAME_START, () => this.startGame());
        EventBus.on(GameEvents.GAME_PAUSE, () => this.pauseGame());
        EventBus.on(GameEvents.GAME_RESUME, () => this.resumeGame());
        EventBus.on(GameEvents.GAME_OVER, () => this.endGame());
        EventBus.on(GameEvents.GAME_RESTART, () => this.restartGame());
        
        // System errors
        EventBus.on(GameEvents.SYSTEM_ERROR, (data) => {
            this.handleSystemError(data);
        });
        
        // Performance events
        EventBus.on(GameEvents.SYSTEM_WARNING, (data) => {
            if (data.type === 'performance') {
                this.adjustPerformanceSettings();
            }
        });
    }
    
    setupInputHandling() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Mouse controls
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Touch controls for mobile
        if ('ontouchstart' in window) {
            this.setupTouchControls();
        }
        
        // Prevent right-click menu
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    handleKeyDown(event) {
        if (!GameState.isPlaying || GameState.isPaused) return;
        
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.player.controls.moveForward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.player.controls.moveBackward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.player.controls.moveLeft = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.player.controls.moveRight = true;
                break;
            case 'KeyQ':
                this.player.controls.rotateLeft = true;
                break;
            case 'KeyE':
                this.player.controls.rotateRight = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.player.controls.boost = true;
                break;
            case 'Space':
                // Could be used for special action
                EventBus.emit(GameEvents.PLAYER_BOOST);
                break;
            case 'Escape':
                if (GameState.isPaused) {
                    GameState.resumeGame();
                } else {
                    GameState.pauseGame();
                }
                break;
        }
    }
    
    handleKeyUp(event) {
        if (!this.player) return;
        
        switch(event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.player.controls.moveForward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.player.controls.moveBackward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.player.controls.moveLeft = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.player.controls.moveRight = false;
                break;
            case 'KeyQ':
                this.player.controls.rotateLeft = false;
                break;
            case 'KeyE':
                this.player.controls.rotateRight = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.player.controls.boost = false;
                break;
        }
    }
    
    handleMouseMove(event) {
        if (!this.player) return;
        
        this.player.controls.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        this.player.controls.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    
    setupTouchControls() {
        // Mobile touch controls will be implemented here
        // This would integrate with a joystick UI component
        EventBus.on(GameEvents.MOBILE_JOYSTICK_MOVE, (data) => {
            if (this.player) {
                this.player.setMobileMovement({
                    active: true,
                    angle: data.angle,
                    magnitude: data.magnitude
                });
            }
        });
    }
    
    startGame() {
        if (this.isRunning) return;
        
        console.log('Starting game...');
        this.isRunning = true;
        this.clock.start();
        this.lastUpdateTime = performance.now();
        
        // Start game loop
        this.gameLoop();
    }
    
    pauseGame() {
        this.clock.stop();
        console.log('Game paused');
    }
    
    resumeGame() {
        this.clock.start();
        this.lastUpdateTime = performance.now();
        console.log('Game resumed');
    }
    
    endGame() {
        this.isRunning = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        console.log('Game ended');
    }
    
    restartGame() {
        this.endGame();
        
        // Reset all systems
        this.systems.forEach(system => {
            if (system.reset) {
                system.reset();
            }
        });
        
        // Reset player
        if (this.player) {
            this.player.spawn();
        }
        
        // Start game again
        this.startGame();
    }
    
    gameLoop() {
        if (!this.isRunning) return;
        
        this.animationId = requestAnimationFrame(() => this.gameLoop());
        
        const currentTime = performance.now();
        const frameTime = currentTime - this.lastUpdateTime;
        
        // Cap delta time to prevent large jumps
        this.deltaTime = Math.min(frameTime / 1000, 0.1);
        this.elapsedTime = this.clock.getElapsedTime();
        
        // Update FPS counter
        this.updateFPS(currentTime);
        
        try {
            // Update game state
            this.update(this.deltaTime);
            
            // Render
            this.render();
            
            // Reset error count on successful frame
            this.errorCount = 0;
            
        } catch (error) {
            this.handleFrameError(error);
        }
        
        this.lastUpdateTime = currentTime;
    }
    
    update(deltaTime) {
        if (GameState.isPaused) return;
        
        // Update player
        if (this.player && GameState.isPlaying) {
            this.player.update(deltaTime);
        }
        
        // Update all systems
        this.systems.forEach(system => {
            try {
                system.update(deltaTime, this.elapsedTime);
            } catch (error) {
                console.error(`Error in system ${system.constructor.name}:`, error);
                EventBus.emit(GameEvents.SYSTEM_WARNING, {
                    type: 'system_error',
                    system: system.constructor.name,
                    error
                });
            }
        });
        
        // Check difficulty periodically
        if (this.elapsedTime - this.lastDifficultyCheck > 5) {
            GameState.checkDifficulty();
            this.lastDifficultyCheck = this.elapsedTime;
        }
        
        // Update performance settings based on entity count
        const totalEntities = GameState.animals.size + GameState.plants.size;
        AssetFactory.updatePerformanceSettings(totalEntities);
    }
    
    render() {
        if (this.sceneManager) {
            this.sceneManager.render();
        }
    }
    
    updateFPS(currentTime) {
        this.frameCount++;
        
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.currentFPS = Math.round(this.frameCount * 1000 / (currentTime - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
            
            // Emit FPS update for UI
            EventBus.emit(GameEvents.UI_UPDATE_HUD, {
                fps: this.currentFPS
            });
            
            // Warn if FPS is too low
            if (this.currentFPS < 30 && GameState.isPlaying) {
                EventBus.emit(GameEvents.SYSTEM_WARNING, {
                    type: 'performance',
                    fps: this.currentFPS
                });
            }
        }
    }
    
    adjustPerformanceSettings() {
        // Reduce quality settings if performance is poor
        if (this.currentFPS < 30) {
            Config.performance.maxParticles = Math.floor(Config.performance.maxParticles * 0.8);
            Config.performance.simplifiedGeometryThreshold = Math.floor(
                Config.performance.simplifiedGeometryThreshold * 0.8
            );
            
            console.log('Performance settings adjusted for better FPS');
        }
    }
    
    handleFrameError(error) {
        this.errorCount++;
        console.error('Frame error:', error);
        
        if (this.errorCount > this.maxErrors) {
            console.error('Too many errors, stopping game loop');
            this.endGame();
            
            EventBus.emit(GameEvents.SYSTEM_ERROR, {
                message: 'Game loop stopped due to repeated errors',
                error
            });
        }
    }
    
    handleSystemError(data) {
        console.error('System error:', data.message, data.error);
        
        // Could show error message to user
        EventBus.emit(GameEvents.UI_NOTIFICATION, {
            type: 'error',
            message: data.message
        });
    }
    
    dispose() {
        // Stop game loop
        this.endGame();
        
        // Dispose all systems
        this.systems.forEach(system => {
            if (system.dispose) {
                system.dispose();
            }
        });
        this.systems = [];
        
        // Dispose player
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        
        // Dispose scene manager
        if (this.sceneManager) {
            this.sceneManager.dispose();
            this.sceneManager = null;
        }
        
        // Dispose asset factory caches
        AssetFactory.dispose();
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('mousemove', this.handleMouseMove);
        
        console.log('GameEngine disposed');
    }
    
    // Debug methods
    getDebugInfo() {
        return {
            fps: this.currentFPS,
            deltaTime: this.deltaTime,
            elapsedTime: this.elapsedTime,
            isRunning: this.isRunning,
            systemCount: this.systems.length,
            errorCount: this.errorCount,
            ...GameState.getDebugInfo(),
            cacheStats: AssetFactory.getCacheStats()
        };
    }
}

export default GameEngine;