// Example: How to connect your Three.js game to the WebSocket feed

class StablecoinGameClient {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.ws = null;
  }
  
  connect() {
    // Connect to WebSocket service
    this.ws = new WebSocket('ws://localhost:8080');
    
    this.ws.onopen = () => {
      console.log('Connected to stablecoin feed');
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'history') {
        // Initial batch of recent transactions
        data.transactions.forEach(tx => this.spawnAnimal(tx));
      } else {
        // Live transaction
        this.spawnAnimal(data);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('Disconnected from feed, reconnecting in 3s...');
      setTimeout(() => this.connect(), 3000);
    };
  }
  
  spawnAnimal(tx) {
    // Convert transaction to game entity
    const animal = {
      type: tx.stablecoin,           // USDC, USDT, or DAI
      size: this.getSize(tx.amount), // Size based on amount
      speed: Math.random() * 2 + 0.5, // 0.5-2.5 units/sec
      position: this.getRandomSpawnPoint(),
      value: parseFloat(tx.amount),
      txHash: tx.tx_hash
    };
    
    // Add to game world
    this.gameEngine.addAnimal(animal);
    
    console.log(`Spawned ${animal.type} animal worth $${animal.value}`);
  }
  
  getSize(amount) {
    // Convert amount to animal size (log scale for better gameplay)
    const value = parseFloat(amount);
    return Math.log10(value + 1) * 0.5 + 0.5; // Size between 0.5 and ~3
  }
  
  getRandomSpawnPoint() {
    // Spawn outside player's view
    const angle = Math.random() * Math.PI * 2;
    const distance = 30; // Spawn 30 units away
    return {
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance
    };
  }
}

// Usage in your game
const gameClient = new StablecoinGameClient(yourGameEngine);
gameClient.connect();