// Example WebSocket service that consumes from Redis pub/sub
// This bridges Redis pub/sub to WebSocket clients (like your game)

const WebSocket = require('ws');
const redis = require('redis');

// Create Redis clients (need 2 - one for sub, one for queries)
const subClient = redis.createClient({ url: process.env.REDIS_URL });
const queryClient = redis.createClient({ url: process.env.REDIS_URL });

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

async function start() {
  await subClient.connect();
  await queryClient.connect();
  
  // Subscribe to stablecoin transactions
  await subClient.subscribe('stablecoin:transactions', (message) => {
    // Broadcast to all connected game clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    console.log('Broadcasted transaction to', wss.clients.size, 'clients');
  });
  
  console.log('Redis subscriber connected and listening...');
  
  // Handle new WebSocket connections
  wss.on('connection', async (ws) => {
    console.log('New game client connected');
    
    // Send recent transactions to catch them up
    const recent = await queryClient.lRange('stablecoin:recent_transactions', 0, 9);
    
    // Send recent history
    ws.send(JSON.stringify({
      type: 'history',
      transactions: recent.map(tx => JSON.parse(tx))
    }));
    
    // Handle client disconnect
    ws.on('close', () => {
      console.log('Game client disconnected');
    });
  });
  
  console.log('WebSocket server listening on port 8080');
}

start().catch(console.error);