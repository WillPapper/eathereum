import { EventBus, GameEvents } from './EventBus.js';
import Config from './Config.js';

class GameStateClass {
    constructor() {
        this.reset();
        this.setupEventListeners();
    }
    
    reset() {
        // Core game state
        this.isPlaying = false;
        this.isPaused = false;
        this.isGameOver = false;
        
        // Player state
        this.player = null;
        this.playerSize = Config.player.startSize;
        this.playerSpeed = Config.player.baseSpeed;
        this.lives = Config.player.startLives;
        
        // Score and statistics
        this.score = 0;
        this.moneyCollected = 0;
        this.highScore = this.loadHighScore();
        this.startTime = null;
        this.endTime = null;
        this.playtime = 0;
        
        // Entity collections
        this.animals = new Set();
        this.plants = new Set();
        this.powerUpFruits = new Set();
        this.leverageFruits = new Set();
        this.speedrunFruits = new Set();
        this.borderTrees = new Set();
        
        // Power-up states
        this.leverageActive = false;
        this.leverageMultiplier = 1.0;
        this.leverageTimer = null;
        this.speedrunActive = false;
        this.speedrunMultiplier = 1.0;
        this.speedrunTimer = null;
        
        // Difficulty
        this.difficulty = Config.difficulty.modes.normal;
        this.survivalMode = false;
        this.allianceMode = false;
        
        // Statistics tracking
        this.stats = {
            total: 0,
            USDC: 0,
            USDT: 0,
            DAI: 0,
            currentPlants: 0,
            currentAnimals: 0,
            moneyCollected: 0,
            animalsEaten: 0,
            powerUpsCollected: 0,
            timesGrown: 0,
            timesShrunk: 0,
            distanceTraveled: 0
        };
        
        // Combo system
        this.combo = {
            count: 0,
            multiplier: 1.0,
            lastEatTime: 0,
            timeout: 3000 // 3 seconds to maintain combo
        };
    }
    
    setupEventListeners() {
        // Score events
        EventBus.on(GameEvents.MONEY_COLLECTED, (amount) => {
            this.addMoney(amount);
        });
        
        // Player events
        EventBus.on(GameEvents.PLAYER_GROW, (newSize) => {
            this.playerSize = newSize;
            this.stats.timesGrown++;
        });
        
        EventBus.on(GameEvents.PLAYER_SHRINK, (newSize) => {
            this.playerSize = newSize;
            this.stats.timesShrunk++;
        });
        
        EventBus.on(GameEvents.PLAYER_DIE, () => {
            this.handlePlayerDeath();
        });
        
        // Power-up events
        EventBus.on(GameEvents.POWERUP_COLLECTED, (type) => {
            this.stats.powerUpsCollected++;
            this.handlePowerUpCollection(type);
        });
        
        // Animal events
        EventBus.on(GameEvents.ANIMAL_EATEN, (data) => {
            this.stats.animalsEaten++;
            this.updateCombo();
        });
        
        // Difficulty events
        EventBus.on(GameEvents.DIFFICULTY_CHANGE, (newDifficulty) => {
            this.difficulty = newDifficulty;
        });
    }
    
    // Game flow methods
    startGame() {
        if (this.isPlaying) return;
        
        this.reset();
        this.isPlaying = true;
        this.startTime = Date.now();
        
        EventBus.emit(GameEvents.GAME_START, {
            difficulty: this.difficulty,
            lives: this.lives
        });
    }
    
    pauseGame() {
        if (!this.isPlaying || this.isPaused) return;
        
        this.isPaused = true;
        EventBus.emit(GameEvents.GAME_PAUSE);
    }
    
    resumeGame() {
        if (!this.isPlaying || !this.isPaused) return;
        
        this.isPaused = false;
        EventBus.emit(GameEvents.GAME_RESUME);
    }
    
    endGame() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        this.isGameOver = true;
        this.endTime = Date.now();
        this.playtime = Math.floor((this.endTime - this.startTime) / 1000);
        
        // Check for high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
            EventBus.emit(GameEvents.HIGH_SCORE_ACHIEVED, this.highScore);
        }
        
        EventBus.emit(GameEvents.GAME_OVER, {
            score: this.score,
            moneyCollected: this.moneyCollected,
            playtime: this.playtime,
            stats: { ...this.stats }
        });
    }
    
    restartGame() {
        this.endGame();
        this.startGame();
        EventBus.emit(GameEvents.GAME_RESTART);
    }
    
    // Score methods
    addScore(points) {
        const oldScore = this.score;
        this.score += Math.round(points * this.combo.multiplier);
        
        EventBus.emit(GameEvents.SCORE_UPDATE, {
            oldScore,
            newScore: this.score,
            delta: this.score - oldScore,
            combo: this.combo.count
        });
    }
    
    addMoney(amount) {
        this.moneyCollected += amount;
        this.stats.moneyCollected += amount;
        this.addScore(amount);
    }
    
    updateCombo() {
        const now = Date.now();
        
        if (now - this.combo.lastEatTime < this.combo.timeout) {
            this.combo.count++;
            this.combo.multiplier = 1 + (this.combo.count * 0.1); // 10% bonus per combo
        } else {
            this.combo.count = 1;
            this.combo.multiplier = 1.0;
        }
        
        this.combo.lastEatTime = now;
    }
    
    // Player methods
    setPlayer(player) {
        this.player = player;
        EventBus.emit(GameEvents.PLAYER_SPAWN, player);
    }
    
    handlePlayerDeath() {
        this.lives--;
        
        if (this.lives <= 0) {
            this.endGame();
        } else {
            EventBus.emit(GameEvents.PLAYER_RESPAWN, {
                livesRemaining: this.lives
            });
        }
    }
    
    addLife() {
        if (this.lives < Config.player.maxLives) {
            this.lives++;
            return true;
        }
        return false;
    }
    
    // Power-up methods
    handlePowerUpCollection(type) {
        switch(type) {
            case 'life':
                this.addLife();
                break;
                
            case 'leverage':
                this.activateLeverage();
                break;
                
            case 'speedrun':
                this.activateSpeedrun();
                break;
        }
    }
    
    activateLeverage(multiplier = 2) {
        // Clear existing timer
        if (this.leverageTimer) {
            clearTimeout(this.leverageTimer);
        }
        
        this.leverageActive = true;
        this.leverageMultiplier = multiplier;
        
        EventBus.emit(GameEvents.POWERUP_ACTIVATED, {
            type: 'leverage',
            multiplier: this.leverageMultiplier,
            duration: Config.powerUps.leverage.effectDuration
        });
        
        // Set timer to deactivate
        this.leverageTimer = setTimeout(() => {
            this.deactivateLeverage();
        }, Config.powerUps.leverage.effectDuration);
    }
    
    deactivateLeverage() {
        this.leverageActive = false;
        this.leverageMultiplier = 1.0;
        this.leverageTimer = null;
        
        EventBus.emit(GameEvents.POWERUP_DEACTIVATED, {
            type: 'leverage'
        });
    }
    
    activateSpeedrun(multiplier = 2) {
        // Clear existing timer
        if (this.speedrunTimer) {
            clearTimeout(this.speedrunTimer);
        }
        
        this.speedrunActive = true;
        this.speedrunMultiplier = multiplier;
        this.playerSpeed = Config.player.baseSpeed * multiplier;
        
        EventBus.emit(GameEvents.POWERUP_ACTIVATED, {
            type: 'speedrun',
            multiplier: this.speedrunMultiplier,
            duration: Config.powerUps.speedrun.effectDuration
        });
        
        // Set timer to deactivate
        this.speedrunTimer = setTimeout(() => {
            this.deactivateSpeedrun();
        }, Config.powerUps.speedrun.effectDuration);
    }
    
    deactivateSpeedrun() {
        this.speedrunActive = false;
        this.speedrunMultiplier = 1.0;
        this.playerSpeed = Config.player.baseSpeed;
        this.speedrunTimer = null;
        
        EventBus.emit(GameEvents.POWERUP_DEACTIVATED, {
            type: 'speedrun'
        });
    }
    
    // Entity management
    addAnimal(animal) {
        this.animals.add(animal);
        this.stats.currentAnimals = this.animals.size;
    }
    
    removeAnimal(animal) {
        this.animals.delete(animal);
        this.stats.currentAnimals = this.animals.size;
    }
    
    addPlant(plant) {
        this.plants.add(plant);
        this.stats.currentPlants = this.plants.size;
        
        // Check if we need to remove old plants
        if (this.plants.size > Config.garden.maxPlants) {
            this.removeOldestPlants();
        }
    }
    
    removePlant(plant) {
        this.plants.delete(plant);
        this.stats.currentPlants = this.plants.size;
    }
    
    removeOldestPlants() {
        const plantsArray = Array.from(this.plants);
        plantsArray.sort((a, b) => a.createdAt - b.createdAt);
        
        const toRemove = plantsArray.slice(0, Config.garden.removeBatchSize);
        toRemove.forEach(plant => {
            this.removePlant(plant);
            EventBus.emit(GameEvents.PLANT_REMOVE, plant);
        });
    }
    
    // Difficulty management
    checkDifficulty() {
        if (!this.isPlaying || this.isPaused) return;
        
        const totalAnimals = this.animals.size;
        if (totalAnimals === 0) return;
        
        // Count edible animals
        let edibleCount = 0;
        let smallerCount = 0;
        
        this.animals.forEach(animal => {
            if (animal.size < this.playerSize) {
                smallerCount++;
                if (animal.size < this.playerSize * 0.8) {
                    edibleCount++;
                }
            }
        });
        
        const edibleRatio = edibleCount / totalAnimals;
        const smallerRatio = smallerCount / totalAnimals;
        
        // Check for alliance mode
        if (smallerRatio > Config.difficulty.allianceThreshold && !this.allianceMode) {
            this.allianceMode = true;
            this.survivalMode = false;
            this.difficulty = Config.difficulty.modes.alliance;
            EventBus.emit(GameEvents.ALLIANCE_MODE_START);
            EventBus.emit(GameEvents.DIFFICULTY_CHANGE, this.difficulty);
        }
        // Check for survival mode
        else if (edibleRatio < Config.difficulty.edibleThreshold && !this.survivalMode) {
            this.survivalMode = true;
            this.allianceMode = false;
            this.difficulty = Config.difficulty.modes.survival;
            EventBus.emit(GameEvents.SURVIVAL_MODE_START);
            EventBus.emit(GameEvents.DIFFICULTY_CHANGE, this.difficulty);
        }
        // Back to normal
        else if ((this.survivalMode && edibleRatio > Config.difficulty.edibleThreshold * 1.5) ||
                 (this.allianceMode && smallerRatio < Config.difficulty.allianceThreshold * 0.8)) {
            this.survivalMode = false;
            this.allianceMode = false;
            this.difficulty = Config.difficulty.modes.normal;
            
            if (this.survivalMode) {
                EventBus.emit(GameEvents.SURVIVAL_MODE_END);
            } else {
                EventBus.emit(GameEvents.ALLIANCE_MODE_END);
            }
            
            EventBus.emit(GameEvents.DIFFICULTY_CHANGE, this.difficulty);
        }
    }
    
    // Persistence methods
    saveHighScore() {
        try {
            localStorage.setItem('stablecoin_visualizer_highscore', this.highScore.toString());
        } catch (e) {
            console.warn('Could not save high score:', e);
        }
    }
    
    loadHighScore() {
        try {
            const saved = localStorage.getItem('stablecoin_visualizer_highscore');
            return saved ? parseInt(saved, 10) : 0;
        } catch (e) {
            console.warn('Could not load high score:', e);
            return 0;
        }
    }
    
    // Getters for computed properties
    get canEatAnimal() {
        return (animal) => {
            const sizeWithLeverage = this.playerSize * this.leverageMultiplier;
            return animal.size < sizeWithLeverage;
        };
    }
    
    get effectivePlayerSize() {
        return this.playerSize * this.leverageMultiplier;
    }
    
    get effectivePlayerSpeed() {
        return this.playerSpeed * this.speedrunMultiplier;
    }
    
    get gameTime() {
        if (!this.startTime) return 0;
        const endTime = this.endTime || Date.now();
        return Math.floor((endTime - this.startTime) / 1000);
    }
    
    // Debug methods
    getDebugInfo() {
        return {
            state: {
                isPlaying: this.isPlaying,
                isPaused: this.isPaused,
                isGameOver: this.isGameOver,
                difficulty: this.difficulty
            },
            player: {
                size: this.playerSize,
                speed: this.playerSpeed,
                lives: this.lives,
                effectiveSize: this.effectivePlayerSize,
                effectiveSpeed: this.effectivePlayerSpeed
            },
            score: {
                current: this.score,
                high: this.highScore,
                money: this.moneyCollected,
                combo: this.combo
            },
            entities: {
                animals: this.animals.size,
                plants: this.plants.size,
                powerUps: this.powerUpFruits.size + this.leverageFruits.size + this.speedrunFruits.size
            },
            powerUps: {
                leverage: this.leverageActive,
                speedrun: this.speedrunActive
            },
            stats: this.stats
        };
    }
}

// Create singleton instance
export const GameState = new GameStateClass();
export default GameState;