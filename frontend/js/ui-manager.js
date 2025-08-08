export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.initializeElements();
    }
    
    initializeElements() {
        this.elements = {
            score: document.getElementById('score'),
            highScore: document.getElementById('highScore'),
            stats: document.getElementById('stats'),
            gameOverScreen: document.getElementById('gameOverScreen'),
            finalScore: document.getElementById('finalScore'),
            finalTime: document.getElementById('finalTime'),
            startScreen: document.getElementById('startScreen'),
            pauseScreen: document.getElementById('pauseScreen'),
            lives: document.getElementById('lives'),
            powerUpTimer: document.getElementById('powerUpTimer'),
            leverageIndicator: document.getElementById('leverageIndicator'),
            speedrunIndicator: document.getElementById('speedrunIndicator'),
            difficultyIndicator: document.getElementById('difficultyIndicator')
        };
    }
    
    update() {
        if (this.elements.score) {
            this.elements.score.textContent = `Score: $${this.gameState.currentScore.toFixed(2)}`;
        }
        
        if (this.elements.highScore) {
            this.elements.highScore.textContent = `High Score: $${this.gameState.highScore.toFixed(2)}`;
        }
        
        if (this.elements.lives) {
            this.updateLives();
        }
        
        if (this.elements.stats) {
            this.updateStats();
        }
        
        if (this.elements.difficultyIndicator) {
            this.updateDifficulty();
        }
    }
    
    updateLives() {
        const livesHTML = '❤️'.repeat(this.gameState.lives) + 
                         '🖤'.repeat(this.gameState.maxLives - this.gameState.lives);
        this.elements.lives.innerHTML = livesHTML;
    }
    
    updateStats() {
        const stats = this.gameState.stats;
        this.elements.stats.innerHTML = `
            <div class="stat-item">Total: ${stats.total}</div>
            <div class="stat-item">USDC: ${stats.USDC}</div>
            <div class="stat-item">USDT: ${stats.USDT}</div>
            <div class="stat-item">DAI: ${stats.DAI}</div>
            <div class="stat-item">Plants: ${stats.currentPlants}</div>
            <div class="stat-item">Animals: ${stats.currentAnimals}</div>
        `;
    }
    
    updateDifficulty() {
        let indicator = '';
        switch(this.gameState.difficultyLevel) {
            case 'survival':
                indicator = '⚠️ SURVIVAL MODE';
                this.elements.difficultyIndicator.style.color = '#ff6600';
                break;
            case 'alliance':
                indicator = '🤝 ALLIANCE MODE';
                this.elements.difficultyIndicator.style.color = '#ff0000';
                break;
            default:
                indicator = '';
        }
        this.elements.difficultyIndicator.textContent = indicator;
    }
    
    showGameOver() {
        if (this.elements.gameOverScreen) {
            this.elements.gameOverScreen.style.display = 'flex';
            
            if (this.elements.finalScore) {
                this.elements.finalScore.textContent = 
                    `Final Score: $${this.gameState.currentScore.toFixed(2)}`;
            }
            
            if (this.elements.finalTime) {
                const time = this.gameState.getPlayTime();
                const minutes = Math.floor(time / 60);
                const seconds = time % 60;
                this.elements.finalTime.textContent = 
                    `Time Survived: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
    
    hideGameOver() {
        if (this.elements.gameOverScreen) {
            this.elements.gameOverScreen.style.display = 'none';
        }
    }
    
    showStartScreen() {
        if (this.elements.startScreen) {
            this.elements.startScreen.style.display = 'flex';
        }
    }
    
    hideStartScreen() {
        if (this.elements.startScreen) {
            this.elements.startScreen.style.display = 'none';
        }
    }
    
    showPauseScreen() {
        if (this.elements.pauseScreen) {
            this.elements.pauseScreen.style.display = 'flex';
        }
    }
    
    hidePauseScreen() {
        if (this.elements.pauseScreen) {
            this.elements.pauseScreen.style.display = 'none';
        }
    }
    
    showPowerUpTimer(duration) {
        if (this.elements.powerUpTimer) {
            this.elements.powerUpTimer.style.display = 'block';
            this.elements.powerUpTimer.textContent = `Power-up: ${Math.ceil(duration / 1000)}s`;
        }
    }
    
    hidePowerUpTimer() {
        if (this.elements.powerUpTimer) {
            this.elements.powerUpTimer.style.display = 'none';
        }
    }
    
    showLeverageIndicator(multiplier) {
        if (this.elements.leverageIndicator) {
            this.elements.leverageIndicator.style.display = 'block';
            this.elements.leverageIndicator.textContent = `LEVERAGE ${multiplier}x`;
        }
    }
    
    hideLeverageIndicator() {
        if (this.elements.leverageIndicator) {
            this.elements.leverageIndicator.style.display = 'none';
        }
    }
    
    showSpeedrunIndicator(multiplier) {
        if (this.elements.speedrunIndicator) {
            this.elements.speedrunIndicator.style.display = 'block';
            this.elements.speedrunIndicator.textContent = `SPEED ${multiplier}x`;
        }
    }
    
    hideSpeedrunIndicator() {
        if (this.elements.speedrunIndicator) {
            this.elements.speedrunIndicator.style.display = 'none';
        }
    }
}