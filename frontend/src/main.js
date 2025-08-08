// Main entry point for the refactored Stablecoin Visualizer

import GameEngine from './core/GameEngine.js';
import GameState from './core/GameState.js';
import { EventBus, GameEvents } from './core/EventBus.js';
import Config from './core/Config.js';

// Global game instance
let gameEngine = null;

// Initialize the game when DOM is ready
function initializeGame() {
    console.log('Initializing Stablecoin Visualizer...');
    
    // Get container element
    const container = document.getElementById('game-container') || document.body;
    
    // Create game engine
    gameEngine = new GameEngine(container);
    
    // Make game engine available globally for debugging
    if (process.env.NODE_ENV === 'development') {
        window.gameEngine = gameEngine;
        window.GameState = GameState;
        window.EventBus = EventBus;
        window.Config = Config;
    }
    
    // Setup UI event handlers
    setupUIEventHandlers();
    
    // Setup WebSocket connection
    setupWebSocketConnection();
    
    // Show start screen
    showStartScreen();
}

function setupUIEventHandlers() {
    // Start button
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', () => {
            hideStartScreen();
            GameState.startGame();
        });
    }
    
    // Restart button
    const restartButton = document.getElementById('restartButton');
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            GameState.restartGame();
        });
    }
    
    // Fullscreen button
    const fullscreenButton = document.getElementById('fullscreenButton');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', toggleFullscreen);
    }
    
    // Listen for game events to update UI
    EventBus.on(GameEvents.GAME_OVER, showGameOverScreen);
    EventBus.on(GameEvents.SCORE_UPDATE, updateScoreDisplay);
    EventBus.on(GameEvents.UI_UPDATE_HUD, updateHUD);
}

function setupWebSocketConnection() {
    // Import the existing websocket module if available
    if (window.TransactionWebSocket) {
        window.TransactionWebSocket.connect();
        
        // Listen for transaction events
        EventBus.on(GameEvents.WS_TRANSACTION, (data) => {
            handleIncomingTransaction(data);
        });
    } else {
        console.warn('WebSocket module not found, running in offline mode');
    }
}

function handleIncomingTransaction(data) {
    // This will be handled by the appropriate system once they're created
    // For now, just log it
    console.log('Incoming transaction:', data);
}

function showStartScreen() {
    const startScreen = document.getElementById('startScreen');
    if (startScreen) {
        startScreen.style.display = 'flex';
    }
}

function hideStartScreen() {
    const startScreen = document.getElementById('startScreen');
    if (startScreen) {
        startScreen.style.display = 'none';
    }
}

function showGameOverScreen() {
    const gameOverScreen = document.getElementById('gameOverScreen');
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex';
        
        // Update final score
        const finalScore = document.getElementById('finalScore');
        if (finalScore) {
            finalScore.textContent = `Final Score: $${GameState.moneyCollected.toFixed(2)}`;
        }
        
        // Update high score
        const highScore = document.getElementById('highScore');
        if (highScore) {
            highScore.textContent = `High Score: $${GameState.highScore.toFixed(2)}`;
        }
    }
}

function updateScoreDisplay(data) {
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        scoreElement.textContent = `$${data.newScore.toFixed(2)}`;
    }
    
    // Show score popup for combo
    if (data.combo > 1) {
        showComboPopup(data.combo, data.delta);
    }
}

function updateHUD(data) {
    // Update FPS display
    if (data.fps !== undefined) {
        const fpsElement = document.getElementById('fps');
        if (fpsElement) {
            fpsElement.textContent = `FPS: ${data.fps}`;
        }
    }
    
    // Update lives display
    if (data.lives !== undefined) {
        const livesElement = document.getElementById('lives');
        if (livesElement) {
            livesElement.textContent = `Lives: ${data.lives}`;
        }
    }
    
    // Update difficulty display
    if (data.difficulty) {
        const difficultyElement = document.getElementById('difficulty');
        if (difficultyElement) {
            difficultyElement.textContent = `Mode: ${data.difficulty}`;
            difficultyElement.className = `difficulty-${data.difficulty}`;
        }
    }
}

function showComboPopup(combo, points) {
    const popup = document.createElement('div');
    popup.className = 'combo-popup';
    popup.textContent = `${combo}x COMBO! +$${points.toFixed(2)}`;
    document.body.appendChild(popup);
    
    // Animate and remove
    setTimeout(() => {
        popup.classList.add('fade-out');
        setTimeout(() => popup.remove(), 500);
    }, 2000);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.warn('Could not enter fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Handle visibility change to pause game
document.addEventListener('visibilitychange', () => {
    if (document.hidden && GameState.isPlaying && !GameState.isPaused) {
        GameState.pauseGame();
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (gameEngine) {
        gameEngine.dispose();
    }
});

// Export for debugging
export { gameEngine };