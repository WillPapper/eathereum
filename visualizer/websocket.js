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
 * - 'status:change' - Connection status changed
 */

class WebSocketManager extends EventTarget {
    constructor() {
        super();
        this.ws = null;
        this.status = 'disconnected';
        this.reconnectTimer = null;
        this.simulationTimer = null;
        this.autoReconnect = true;
        this.simulationMode = false;
        
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
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.hostname === 'localhost' ? ':8080' : '';
        const wsUrl = `${protocol}//${host}${port}${this.config.wsEndpoint}`;
        
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
                
                // Emit transaction event with the data
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
            simulationMode: this.simulationMode
        };
    }
}

// Create global instance
const wsManager = new WebSocketManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
}