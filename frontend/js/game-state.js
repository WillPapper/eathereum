export class GameState {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.isGameOver = false;
        this.isPaused = false;
        this.highScore = this.highScore || 0;
        this.currentScore = 0;
        this.moneyCollected = 0;
        this.startTime = null;
        this.endTime = null;
        this.lives = 1;
        this.maxLives = 5;
        
        // Statistics
        this.stats = {
            total: 0,
            USDC: 0,
            USDT: 0,
            DAI: 0,
            currentPlants: 0,
            currentAnimals: 0,
            moneyCollected: 0
        };
        
        // Difficulty
        this.difficultyLevel = 'normal';
        this.allianceActive = false;
    }
    
    startGame() {
        this.startTime = Date.now();
        this.isGameOver = false;
    }
    
    endGame() {
        this.isGameOver = true;
        this.endTime = Date.now();
        
        if (this.currentScore > this.highScore) {
            this.highScore = this.currentScore;
            this.saveHighScore();
        }
    }
    
    addScore(amount) {
        this.currentScore += amount;
        this.moneyCollected += amount;
        this.stats.moneyCollected += amount;
    }
    
    addLife() {
        this.lives = Math.min(this.lives + 1, this.maxLives);
    }
    
    loseLife() {
        this.lives--;
        if (this.lives <= 0) {
            this.endGame();
        }
    }
    
    getPlayTime() {
        if (!this.startTime) return 0;
        const endTime = this.endTime || Date.now();
        return Math.floor((endTime - this.startTime) / 1000);
    }
    
    saveHighScore() {
        try {
            localStorage.setItem('stablecoin-visualizer-highscore', this.highScore.toString());
        } catch (e) {
            console.error('Failed to save high score:', e);
        }
    }
    
    loadHighScore() {
        try {
            const saved = localStorage.getItem('stablecoin-visualizer-highscore');
            if (saved) {
                this.highScore = parseInt(saved) || 0;
            }
        } catch (e) {
            console.error('Failed to load high score:', e);
        }
    }
    
    updateStats(type, delta = 1) {
        if (this.stats[type] !== undefined) {
            this.stats[type] += delta;
        }
    }
}