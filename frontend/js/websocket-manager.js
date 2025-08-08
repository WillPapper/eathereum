export class WebSocketManager {
    constructor(entityManager) {
        this.entityManager = entityManager;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.pingInterval = null;
        this.lastPingTime = null;
        this.latency = 0;
    }
    
    connect() {
        const wsUrl = this.getWebSocketUrl();
        console.log('Connecting to WebSocket:', wsUrl);
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }
    
    getWebSocketUrl() {
        // Check for environment-specific URL
        if (window.WS_URL) {
            return window.WS_URL;
        }
        
        // Default to local development
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        const port = '8080';
        
        return `${protocol}//${host}:${port}/ws`;
    }
    
    setupEventHandlers() {
        this.ws.onopen = () => this.onOpen();
        this.ws.onmessage = (event) => this.onMessage(event);
        this.ws.onclose = () => this.onClose();
        this.ws.onerror = (error) => this.onError(error);
    }
    
    onOpen() {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('connected');
        this.startPingInterval();
    }
    
    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle ping response
            if (data.type === 'pong') {
                this.handlePong();
                return;
            }
            
            // Handle transaction data
            if (data.stablecoin) {
                this.processTransaction(data);
            }
        } catch (error) {
            console.error('Failed to process message:', error);
        }
    }
    
    processTransaction(data) {
        // Update statistics
        if (window.game && window.game.gameState) {
            window.game.gameState.updateStats('total', 1);
            window.game.gameState.updateStats(data.stablecoin, 1);
        }
        
        // Queue entity for controlled spawning
        if (this.entityManager) {
            this.entityManager.queueTransaction(data);
        }
        
        // Update transaction feed UI
        this.updateTransactionFeed(data);
        
        // Update queue counter in UI
        this.updateQueueCounter();
    }
    
    updateQueueCounter() {
        const queueCount = document.getElementById('queue-count');
        if (queueCount && this.entityManager) {
            const stats = this.entityManager.spawnQueue.getStats();
            queueCount.textContent = stats.queueLength;
        }
    }
    
    updateTransactionFeed(data) {
        const feedElement = document.getElementById('transaction-list');
        if (!feedElement) return;
        
        const transactionElement = document.createElement('div');
        transactionElement.className = 'transaction-item';
        transactionElement.innerHTML = `
            <span class="tx-coin ${data.stablecoin.toLowerCase()}">${data.stablecoin}</span>
            <span class="tx-amount">$${parseFloat(data.amount).toFixed(2)}</span>
        `;
        
        // Add to feed
        feedElement.insertBefore(transactionElement, feedElement.firstChild);
        
        // Limit feed size
        while (feedElement.children.length > 10) {
            feedElement.removeChild(feedElement.lastChild);
        }
        
        // Fade in animation
        transactionElement.style.opacity = '0';
        setTimeout(() => {
            transactionElement.style.opacity = '1';
        }, 10);
    }
    
    onClose() {
        console.log('WebSocket disconnected');
        this.updateConnectionStatus('disconnected');
        this.stopPingInterval();
        this.scheduleReconnect();
    }
    
    onError(error) {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus('error');
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }
    
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // Ping every 30 seconds
    }
    
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    handlePong() {
        if (this.lastPingTime) {
            this.latency = Date.now() - this.lastPingTime;
            this.updateLatency();
        }
    }
    
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            statusElement.className = status;
        }
    }
    
    updateLatency() {
        const latencyElement = document.getElementById('latency');
        if (latencyElement) {
            latencyElement.textContent = `${this.latency}ms`;
        }
    }
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    disconnect() {
        this.stopPingInterval();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}