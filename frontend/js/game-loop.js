export class GameLoop {
    constructor(game) {
        this.game = game;
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateInterval = 1000;
        this.lastFpsUpdate = 0;
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.animate();
    }
    
    stop() {
        this.isRunning = false;
    }
    
    pause() {
        this.isPaused = true;
    }
    
    resume() {
        if (!this.isRunning) return;
        
        this.isPaused = false;
        this.lastTime = performance.now();
        this.animate();
    }
    
    animate() {
        if (!this.isRunning || this.isPaused) return;
        
        requestAnimationFrame(() => this.animate());
        
        const currentTime = performance.now();
        this.deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        
        // Cap deltaTime to prevent large jumps
        this.deltaTime = Math.min(this.deltaTime, 0.1);
        
        // Update FPS counter
        this.updateFPS(currentTime);
        
        // Update game
        this.game.update(this.deltaTime);
        
        // Render
        this.game.render();
    }
    
    updateFPS(currentTime) {
        this.frameCount++;
        
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
            
            // Update FPS display if it exists
            const fpsElement = document.getElementById('fps');
            if (fpsElement) {
                fpsElement.textContent = `FPS: ${this.fps}`;
            }
        }
    }
}