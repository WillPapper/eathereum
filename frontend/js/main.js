// Main entry point for the refactored visualizer
import { CONFIG } from './config.js';
import { SceneManager } from './scene-manager.js';
import { PlayerController } from './player.js';
import { GameState } from './game-state.js';
import { UIManager } from './ui-manager.js';
import { EntityManager } from './entity-manager.js';
import { WebSocketManager } from './websocket-manager.js';
import { GameLoop } from './game-loop.js';

class StablecoinVisualizer {
    constructor() {
        this.sceneManager = new SceneManager();
        this.playerController = new PlayerController();
        this.gameState = new GameState();
        this.uiManager = new UIManager(this.gameState);
        this.entityManager = new EntityManager(this.sceneManager, this.gameState);
        this.websocketManager = new WebSocketManager(this.entityManager);
        this.gameLoop = new GameLoop(this);
        
        this.initialize();
    }
    
    initialize() {
        // Initialize scene
        this.sceneManager.initialize();
        
        // Create player
        this.createPlayer();
        
        // Load saved data
        this.gameState.loadHighScore();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket
        this.websocketManager.connect();
        
        // Show start screen
        this.uiManager.showStartScreen();
    }
    
    createPlayer() {
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0x4169E1, // Royal blue
            emissive: 0x2143A1,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        
        const playerMesh = new THREE.Mesh(geometry, material);
        playerMesh.position.set(0, 0, 0);
        playerMesh.castShadow = true;
        playerMesh.receiveShadow = true;
        
        this.playerController.controls.mesh = playerMesh;
        this.sceneManager.addToScene(playerMesh);
    }
    
    setupEventListeners() {
        // Start button
        const startButton = document.getElementById('startButton') || 
                          document.getElementById('play-btn');
        if (startButton) {
            startButton.addEventListener('click', () => this.startGame());
        }
        
        // Restart button
        const restartButton = document.getElementById('restartButton');
        if (restartButton) {
            restartButton.addEventListener('click', () => this.restartGame());
        }
        
        // Pause handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.togglePause();
            }
        });
        
        // Pause button
        const pauseButton = document.getElementById('pause-btn');
        if (pauseButton) {
            pauseButton.addEventListener('click', () => this.togglePause());
        }
        
        // Clear button
        const clearButton = document.getElementById('clear-btn');
        if (clearButton) {
            clearButton.addEventListener('click', () => this.clearEntities());
        }
    }
    
    startGame() {
        this.gameState.reset();
        this.gameState.startGame();
        this.playerController.controls.isPlaying = true;
        this.playerController.reset();
        
        this.uiManager.hideStartScreen();
        this.uiManager.hideGameOver();
        
        // Start game loop
        this.gameLoop.start();
        
        // Update game status display
        const gameStatus = document.getElementById('game-status');
        if (gameStatus) {
            gameStatus.style.display = 'block';
        }
    }
    
    restartGame() {
        this.clearEntities();
        this.startGame();
    }
    
    togglePause() {
        if (!this.playerController.controls.isPlaying) return;
        
        this.gameState.isPaused = !this.gameState.isPaused;
        
        if (this.gameState.isPaused) {
            this.uiManager.showPauseScreen();
            this.gameLoop.pause();
        } else {
            this.uiManager.hidePauseScreen();
            this.gameLoop.resume();
        }
    }
    
    clearEntities() {
        this.entityManager.clearAll();
    }
    
    gameOver() {
        this.playerController.controls.isPlaying = false;
        this.gameState.endGame();
        this.gameLoop.stop();
        this.uiManager.showGameOver();
        
        // Hide game status
        const gameStatus = document.getElementById('game-status');
        if (gameStatus) {
            gameStatus.style.display = 'none';
        }
    }
    
    update(deltaTime) {
        if (this.gameState.isPaused || this.gameState.isGameOver) return;
        
        // Update player
        this.playerController.update(deltaTime, this.sceneManager.camera);
        
        // Update entities
        this.entityManager.update(deltaTime, this.playerController);
        
        // Check collisions
        this.checkCollisions();
        
        // Update UI
        this.uiManager.update();
        
        // Update scene effects
        this.sceneManager.updateDayNightCycle(Date.now());
    }
    
    checkCollisions() {
        // Check player vs entities collisions
        const collisionResult = this.entityManager.checkPlayerCollisions(this.playerController);
        
        if (collisionResult) {
            if (collisionResult.type === 'death') {
                this.gameState.loseLife();
                if (this.gameState.lives <= 0) {
                    this.gameOver();
                } else {
                    // Respawn player
                    this.playerController.reset();
                }
            } else if (collisionResult.type === 'eat') {
                this.gameState.addScore(collisionResult.value);
                this.playerController.setSize(
                    this.playerController.controls.size + collisionResult.sizeGain
                );
            } else if (collisionResult.type === 'powerup') {
                this.handlePowerUp(collisionResult.powerupType);
            }
        }
    }
    
    handlePowerUp(type) {
        switch(type) {
            case 'life':
                this.gameState.addLife();
                break;
            case 'leverage':
                this.applyLeverage();
                break;
            case 'speedrun':
                this.applySpeedBoost();
                break;
        }
    }
    
    applyLeverage() {
        const currentSize = this.playerController.controls.size;
        this.playerController.setSize(currentSize * 2);
        this.uiManager.showLeverageIndicator(2);
        
        setTimeout(() => {
            this.playerController.setSize(currentSize);
            this.uiManager.hideLeverageIndicator();
        }, CONFIG.LEVERAGE.EFFECT_DURATION);
    }
    
    applySpeedBoost() {
        const currentSpeed = this.playerController.controls.speed;
        this.playerController.controls.speed = currentSpeed * 2;
        this.uiManager.showSpeedrunIndicator(2);
        
        setTimeout(() => {
            this.playerController.controls.speed = currentSpeed;
            this.uiManager.hideSpeedrunIndicator();
        }, CONFIG.SPEEDRUN.EFFECT_DURATION);
    }
    
    render() {
        this.sceneManager.render();
    }
}

// Initialize the game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.game = new StablecoinVisualizer();
        setupDebugCommands();
    });
} else {
    window.game = new StablecoinVisualizer();
    setupDebugCommands();
}

// Debug console commands for development
function setupDebugCommands() {
    // Configure spawn queue
    window.configureSpawnQueue = function(options) {
        if (window.game && window.game.entityManager) {
            window.game.entityManager.spawnQueue.configure(options);
            console.log('Spawn queue configured:', window.game.entityManager.spawnQueue.getStats());
        }
    };
    
    // Get spawn queue statistics
    window.getSpawnQueueStats = function() {
        if (window.game && window.game.entityManager) {
            return window.game.entityManager.spawnQueue.getStats();
        }
        return null;
    };
    
    // Spawn test animal
    window.spawnTestAnimal = function(size = 1) {
        if (window.game && window.game.entityManager) {
            const testData = {
                stablecoin: 'USDC',
                amount: Math.pow(10, size).toString(),
                from: '0xtest',
                to: '0xtest',
                block_number: 0,
                tx_hash: '0xtest'
            };
            window.game.entityManager.addAnimal(testData);
            console.log('Spawned test animal with size:', size);
        }
    };
    
    // Spawn test plant
    window.spawnTestPlant = function(amount = 10000) {
        if (window.game && window.game.entityManager) {
            const testData = {
                stablecoin: 'DAI',
                amount: amount.toString(),
                from: '0xtest',
                to: '0xtest',
                block_number: 0,
                tx_hash: '0xtest'
            };
            window.game.entityManager.addPlant(testData);
            console.log('Spawned test plant with amount:', amount);
        }
    };
    
    // Set player size
    window.setPlayerSize = function(size) {
        if (window.game && window.game.playerController) {
            window.game.playerController.setSize(size);
            console.log('Player size set to:', size);
        }
    };
    
    // Set difficulty level
    window.setDifficulty = function(level) {
        if (window.game && window.game.gameState) {
            window.game.gameState.difficultyLevel = level;
            console.log('Difficulty set to:', level);
        }
    };
    
    // Clear all entities
    window.clearAll = function() {
        if (window.game && window.game.entityManager) {
            window.game.clearEntities();
            console.log('All entities cleared');
        }
    };
    
    // Get game statistics
    window.getGameStats = function() {
        if (window.game && window.game.gameState) {
            return {
                score: window.game.gameState.currentScore,
                lives: window.game.gameState.lives,
                playTime: window.game.gameState.getPlayTime(),
                difficulty: window.game.gameState.difficultyLevel,
                stats: window.game.gameState.stats,
                spawnQueue: window.game.entityManager.spawnQueue.getStats()
            };
        }
        return null;
    };
    
    // Performance monitoring
    window.getPerformanceStats = function() {
        if (window.game) {
            return {
                fps: window.game.gameLoop.fps,
                entities: {
                    plants: window.game.entityManager.plants.length,
                    animals: window.game.entityManager.animals.length,
                    powerUps: window.game.entityManager.powerUpFruits.length
                },
                memory: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB',
                    total: Math.round(performance.memory.totalJSHeapSize / 1048576) + ' MB'
                } : 'Not available'
            };
        }
        return null;
    };
    
    console.log(`
🎮 Debug Commands Available:
- configureSpawnQueue({spawnDelay: 1000}) - Configure spawn settings
- getSpawnQueueStats() - View spawn queue statistics
- spawnTestAnimal(size) - Spawn test animal
- spawnTestPlant(amount) - Spawn test plant
- setPlayerSize(size) - Set player size
- setDifficulty('normal'|'survival'|'alliance') - Set difficulty
- clearAll() - Clear all entities
- getGameStats() - Get current game statistics
- getPerformanceStats() - Get performance metrics
    `);
}