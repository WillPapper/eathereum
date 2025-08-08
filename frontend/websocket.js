/**
 * WebSocket Manager for Stablecoin Visualizer
 * 
 * This module handles all WebSocket communication with the game server.
 * It's separated from the visualization code to allow parallel development.
 * 
 * Events emitted:
 * - 'connection:open' - WebSocket connected
 * - 'connection:close' - WebSocket disconnected  
 * - 'connection:error' - Connection error occurred
 * - 'transaction' - New transaction received
 * - 'spawn:animal' - Animal ready to spawn from queue
 * - 'status:change' - Connection status changed
 */

/**
 * Spawn Queue Manager
 * Controls the rate at which animals spawn and ensures balanced size distribution
 */
class SpawnQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastSpawnTime = 0;
        this.spawnDelay = 800; // Minimum ms between spawns
        this.maxQueueSize = 50; // Maximum queue size to prevent memory issues
        
        // Size distribution settings
        this.sizeDistribution = {
            smallerThanPlayer: 0.65, // 65% smaller than player
            largerThanPlayer: 0.35   // 35% larger than player
        };
    }
    
    /**
     * Add transaction to spawn queue
     */
    enqueue(transactionData) {
        // If queue is full, remove oldest items
        if (this.queue.length >= this.maxQueueSize) {
            this.queue.shift();
        }
        
        this.queue.push({
            data: transactionData,
            timestamp: Date.now()
        });
        
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }
    }
    
    /**
     * Process the spawn queue with controlled timing
     */
    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }
        
        this.processing = true;
        
        // Calculate time since last spawn
        const now = Date.now();
        const timeSinceLastSpawn = now - this.lastSpawnTime;
        
        // Wait if not enough time has passed
        if (timeSinceLastSpawn < this.spawnDelay) {
            const waitTime = this.spawnDelay - timeSinceLastSpawn;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Get next item from queue
        const item = this.queue.shift();
        if (item) {
            // Sort remaining queue items by size relative to player
            this.sortQueueByDesiredDistribution();
            
            // Emit spawn event
            this.emitSpawnEvent(item.data);
            this.lastSpawnTime = Date.now();
        }
        
        // Continue processing
        if (this.queue.length > 0) {
            // Use requestAnimationFrame for smooth spawning
            requestAnimationFrame(() => this.processQueue());
        } else {
            this.processing = false;
        }
    }
    
    /**
     * Sort queue to maintain desired size distribution
     */
    sortQueueByDesiredDistribution() {
        // Only sort if we have player size info and items in queue
        if (this.queue.length === 0 || typeof playerControls === 'undefined') return;
        
        const playerSize = playerControls.size || 1.0;
        
        // Calculate each transaction's size
        this.queue.forEach(item => {
            const amount = parseFloat(item.data.amount);
            const amountLog = Math.log10(amount + 1);
            item.animalSize = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4);
            item.isSmaller = item.animalSize < playerSize;
        });
        
        // Count current distribution
        const smallerCount = this.queue.filter(item => item.isSmaller).length;
        const totalCount = this.queue.length;
        const currentSmallerRatio = totalCount > 0 ? smallerCount / totalCount : 0;
        
        // If we need more smaller animals, prioritize them
        if (currentSmallerRatio < this.sizeDistribution.smallerThanPlayer) {
            this.queue.sort((a, b) => {
                // Prioritize smaller animals if we need more
                if (a.isSmaller && !b.isSmaller) return -1;
                if (!a.isSmaller && b.isSmaller) return 1;
                // Otherwise maintain FIFO order
                return a.timestamp - b.timestamp;
            });
        } else if (currentSmallerRatio > this.sizeDistribution.smallerThanPlayer) {
            // If we have too many smaller animals, prioritize larger ones
            this.queue.sort((a, b) => {
                // Prioritize larger animals if we have too many small ones
                if (!a.isSmaller && b.isSmaller) return -1;
                if (a.isSmaller && !b.isSmaller) return 1;
                // Otherwise maintain FIFO order
                return a.timestamp - b.timestamp;
            });
        }
    }
    
    /**
     * Emit spawn event for processed transaction
     */
    emitSpawnEvent(transactionData) {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            const event = new CustomEvent('spawn:animal', { detail: transactionData });
            window.dispatchEvent(event);
        }
    }
    
    /**
     * Clear the spawn queue
     */
    clear() {
        this.queue = [];
        this.processing = false;
    }
    
    /**
     * Get queue statistics
     */
    getStats() {
        const playerSize = (typeof playerControls !== 'undefined') ? (playerControls.size || 1.0) : 1.0;
        const stats = {
            queueLength: this.queue.length,
            processing: this.processing,
            spawnDelay: this.spawnDelay
        };
        
        // Calculate size distribution in queue
        if (this.queue.length > 0) {
            const smaller = this.queue.filter(item => {
                const amount = parseFloat(item.data.amount);
                const amountLog = Math.log10(amount + 1);
                const size = Math.min(Math.max(amountLog * 0.5 + 0.5, 0.5), 4);
                return size < playerSize;
            }).length;
            
            stats.smallerThanPlayer = smaller;
            stats.largerThanPlayer = this.queue.length - smaller;
            stats.smallerRatio = (smaller / this.queue.length * 100).toFixed(1) + '%';
        }
        
        return stats;
    }
    
    /**
     * Update spawn delay
     */
    setSpawnDelay(delay) {
        this.spawnDelay = Math.max(100, Math.min(5000, delay)); // Clamp between 100ms and 5s
    }
    
    /**
     * Update size distribution
     */
    setSizeDistribution(smallerRatio) {
        const ratio = Math.max(0, Math.min(1, smallerRatio));
        this.sizeDistribution.smallerThanPlayer = ratio;
        this.sizeDistribution.largerThanPlayer = 1 - ratio;
    }
}

class WebSocketManager extends EventTarget {
    constructor() {
        super();
        this.ws = null;
        this.status = 'disconnected';
        this.reconnectTimer = null;
        this.simulationTimer = null;
        this.autoReconnect = true;
        this.simulationMode = false;
        
        // Initialize spawn queue
        this.spawnQueue = new SpawnQueue();
        
        // Configuration
        this.config = {
            reconnectDelay: 3000,
            reconnectMaxDelay: 30000,
            simulationInterval: 500,
            wsEndpoint: '/ws'
        };
        
        // Statistics
        this.stats = {
            messagesReceived: 0,
            connectionAttempts: 0,
            lastMessageTime: null
        };
    }
    
    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }
        
        this.stats.connectionAttempts++;
        
        // Determine WebSocket URL based on environment
        let wsUrl;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Local development
            wsUrl = `ws://localhost:8080${this.config.wsEndpoint}`;
        } else {
            // Production - use the game server on Render
            wsUrl = `wss://game-server-i4ne.onrender.com${this.config.wsEndpoint}`;
        }
        
        console.log(`Connecting to WebSocket: ${wsUrl}`);
        this.updateStatus('connecting');
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.updateStatus('error');
            this.fallbackToSimulation();
        }
    }
    
    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('connected');
            this.simulationMode = false;
            this.stopSimulation();
            
            // Clear any reconnect timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            
            this.dispatchEvent(new CustomEvent('connection:open'));
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.stats.messagesReceived++;
                this.stats.lastMessageTime = Date.now();
                
                // Add transaction to spawn queue instead of immediately emitting
                this.spawnQueue.enqueue(data);
                
                // Still emit the raw transaction event for other purposes (stats, etc)
                this.dispatchEvent(new CustomEvent('transaction', { detail: data }));
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('error');
            this.dispatchEvent(new CustomEvent('connection:error', { detail: error }));
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.ws = null;
            this.updateStatus('disconnected');
            this.dispatchEvent(new CustomEvent('connection:close'));
            
            // Auto-reconnect if enabled
            if (this.autoReconnect && !this.reconnectTimer) {
                this.scheduleReconnect();
            }
        };
    }
    
    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        this.autoReconnect = false;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Clear spawn queue on disconnect
        this.spawnQueue.clear();
        
        this.stopSimulation();
        this.updateStatus('disconnected');
    }
    
    /**
     * Toggle connection state
     */
    toggle() {
        if (this.isConnected()) {
            this.disconnect();
            return false;
        } else {
            this.autoReconnect = true;
            this.connect();
            return true;
        }
    }
    
    /**
     * Check if WebSocket is connected
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * Schedule automatic reconnection
     */
    scheduleReconnect() {
        const delay = Math.min(
            this.config.reconnectDelay * Math.pow(1.5, this.stats.connectionAttempts - 1),
            this.config.reconnectMaxDelay
        );
        
        console.log(`Scheduling reconnect in ${delay}ms`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.autoReconnect) {
                this.connect();
            }
        }, delay);
    }
    
    /**
     * Update connection status
     */
    updateStatus(status) {
        const oldStatus = this.status;
        this.status = status;
        
        if (oldStatus !== status) {
            this.dispatchEvent(new CustomEvent('status:change', { 
                detail: { status, oldStatus } 
            }));
        }
    }
    
    /**
     * Fallback to simulation mode when connection fails
     */
    fallbackToSimulation() {
        if (!this.simulationMode) {
            console.log('Falling back to simulation mode');
            this.simulationMode = true;
            this.startSimulation();
        }
    }
    
    /**
     * Start transaction simulation
     */
    startSimulation() {
        if (this.simulationTimer) return;
        
        this.updateStatus('simulating');
        
        const simulate = () => {
            // Only simulate if not connected and simulation is active
            if (!this.isConnected() && this.simulationMode) {
                if (Math.random() < 0.3) {
                    const transaction = this.generateMockTransaction();
                    // Add to spawn queue instead of immediately emitting
                    this.spawnQueue.enqueue(transaction);
                    // Still emit raw transaction for stats
                    this.dispatchEvent(new CustomEvent('transaction', { detail: transaction }));
                }
                
                // Schedule next simulation
                const nextDelay = this.config.simulationInterval + Math.random() * 500;
                this.simulationTimer = setTimeout(simulate, nextDelay);
            } else {
                this.simulationTimer = null;
            }
        };
        
        simulate();
    }
    
    /**
     * Stop transaction simulation
     */
    stopSimulation() {
        if (this.simulationTimer) {
            clearTimeout(this.simulationTimer);
            this.simulationTimer = null;
        }
        this.simulationMode = false;
    }
    
    /**
     * Generate mock transaction for testing
     */
    generateMockTransaction() {
        const stablecoins = ['USDC', 'USDT', 'DAI'];
        const stablecoin = stablecoins[Math.floor(Math.random() * stablecoins.length)];
        
        // Generate different amount ranges for variety
        let amount;
        const rand = Math.random();
        if (rand < 0.6) {
            // 60% small transactions (1-1000)
            amount = (Math.random() * 999 + 1).toFixed(2);
        } else if (rand < 0.85) {
            // 25% medium transactions (1000-10000)
            amount = (Math.random() * 9000 + 1000).toFixed(2);
        } else if (rand < 0.95) {
            // 10% large transactions (10000-50000)
            amount = (Math.random() * 40000 + 10000).toFixed(2);
        } else {
            // 5% whale transactions (50000-500000)
            amount = (Math.random() * 450000 + 50000).toFixed(2);
        }
        
        return {
            stablecoin: stablecoin,
            amount: amount,
            from: '0x' + Math.random().toString(16).substr(2, 40),
            to: '0x' + Math.random().toString(16).substr(2, 40),
            block_number: Math.floor(Math.random() * 1000000) + 30000000,
            tx_hash: '0x' + Math.random().toString(16).substr(2, 64)
        };
    }
    
    /**
     * Get connection statistics
     */
    getStats() {
        return {
            ...this.stats,
            status: this.status,
            isConnected: this.isConnected(),
            simulationMode: this.simulationMode,
            spawnQueue: this.spawnQueue.getStats()
        };
    }
    
    /**
     * Configure spawn queue settings
     */
    configureSpawnQueue(options = {}) {
        if (options.spawnDelay !== undefined) {
            this.spawnQueue.setSpawnDelay(options.spawnDelay);
        }
        if (options.smallerRatio !== undefined) {
            this.spawnQueue.setSizeDistribution(options.smallerRatio);
        }
        if (options.maxQueueSize !== undefined) {
            this.spawnQueue.maxQueueSize = Math.max(10, Math.min(200, options.maxQueueSize));
        }
    }
    
    /**
     * Get spawn queue instance for advanced control
     */
    getSpawnQueue() {
        return this.spawnQueue;
    }
}

// Create global instance
const wsManager = new WebSocketManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
}