// Three.js scene setup
let scene, camera, renderer;
let particles = [];
let isPaused = false;
let ws = null;

// Stablecoin colors
const STABLECOIN_COLORS = {
    USDC: 0x2775CA,  // Blue
    USDT: 0x26A17B,  // Green
    DAI: 0xF5AC37   // Yellow/Orange
};

// Statistics
const stats = {
    total: 0,
    USDC: 0,
    USDT: 0,
    DAI: 0
};

// Transaction particle class
class TransactionParticle {
    constructor(stablecoin, amount, from, to) {
        this.stablecoin = stablecoin;
        this.amount = amount;
        this.from = from;
        this.to = to;
        
        // Create sphere geometry for the particle
        const size = Math.log10(parseFloat(amount) + 1) * 0.1 + 0.1; // Size based on amount
        const geometry = new THREE.SphereGeometry(size, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: STABLECOIN_COLORS[stablecoin] || 0xFFFFFF,
            transparent: true,
            opacity: 0.8
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Random starting position
        this.mesh.position.x = (Math.random() - 0.5) * 100;
        this.mesh.position.y = 50;
        this.mesh.position.z = (Math.random() - 0.5) * 100;
        
        // Velocity for animation
        this.velocity = {
            x: (Math.random() - 0.5) * 0.5,
            y: -Math.random() * 0.5 - 0.5,
            z: (Math.random() - 0.5) * 0.5
        };
        
        this.age = 0;
        this.maxAge = 300; // Frames before particle fades out
    }
    
    update() {
        if (isPaused) return;
        
        // Update position
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.y += this.velocity.y;
        this.mesh.position.z += this.velocity.z;
        
        // Apply gravity
        this.velocity.y -= 0.01;
        
        // Bounce off floor
        if (this.mesh.position.y < -30) {
            this.mesh.position.y = -30;
            this.velocity.y *= -0.5;
        }
        
        // Age and fade
        this.age++;
        if (this.age > this.maxAge * 0.7) {
            const fadeProgress = (this.age - this.maxAge * 0.7) / (this.maxAge * 0.3);
            this.mesh.material.opacity = 0.8 * (1 - fadeProgress);
        }
        
        return this.age < this.maxAge;
    }
}

// Initialize Three.js scene
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 100, 200);
    
    // Camera
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 20, 80);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x222222);
    gridHelper.position.y = -30;
    scene.add(gridHelper);
    
    // Axes helper (optional, for debugging)
    // const axesHelper = new THREE.AxesHelper(50);
    // scene.add(axesHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Add a new transaction particle
function addTransaction(data) {
    const particle = new TransactionParticle(
        data.stablecoin,
        data.amount,
        data.from,
        data.to
    );
    
    particles.push(particle);
    scene.add(particle.mesh);
    
    // Update statistics
    stats.total++;
    stats[data.stablecoin]++;
    updateStats();
}

// Update statistics display
function updateStats() {
    document.getElementById('total-transactions').textContent = stats.total;
    document.getElementById('usdc-count').textContent = stats.USDC;
    document.getElementById('usdt-count').textContent = stats.USDT;
    document.getElementById('dai-count').textContent = stats.DAI;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update particles
    particles = particles.filter(particle => {
        const alive = particle.update();
        if (!alive) {
            scene.remove(particle.mesh);
            particle.mesh.geometry.dispose();
            particle.mesh.material.dispose();
        }
        return alive;
    });
    
    // Rotate camera slightly for dynamic view
    if (!isPaused) {
        const time = Date.now() * 0.0001;
        camera.position.x = Math.cos(time) * 80;
        camera.position.z = Math.sin(time) * 80;
        camera.lookAt(0, 0, 0);
    }
    
    renderer.render(scene, camera);
}

// WebSocket connection
function connectWebSocket() {
    const statusEl = document.getElementById('status');
    
    // For now, we'll simulate transactions since WebSocket server isn't implemented yet
    statusEl.textContent = 'Simulating';
    statusEl.className = 'connected';
    
    // Simulate random transactions
    simulateTransactions();
    
    // Actual WebSocket code (to be used when server is ready):
    /*
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        console.log('Connected to WebSocket server');
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addTransaction(data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusEl.textContent = 'Error';
        statusEl.className = 'error';
    };
    
    ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        console.log('Disconnected from WebSocket server');
        ws = null;
    };
    */
}

// Simulate transactions for testing
function simulateTransactions() {
    if (isPaused || !ws === null) return;
    
    // Random chance to create a transaction
    if (Math.random() < 0.3) {
        const stablecoins = ['USDC', 'USDT', 'DAI'];
        const stablecoin = stablecoins[Math.floor(Math.random() * stablecoins.length)];
        
        const transaction = {
            stablecoin: stablecoin,
            amount: (Math.random() * 10000).toFixed(2),
            from: '0x' + Math.random().toString(16).substr(2, 40),
            to: '0x' + Math.random().toString(16).substr(2, 40)
        };
        
        addTransaction(transaction);
    }
    
    // Continue simulating
    setTimeout(simulateTransactions, Math.random() * 1000 + 200);
}

// Disconnect WebSocket
function disconnectWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
    
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'disconnected';
}

// Clear all particles
function clearParticles() {
    particles.forEach(particle => {
        scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        particle.mesh.material.dispose();
    });
    particles = [];
    
    // Reset stats
    stats.total = 0;
    stats.USDC = 0;
    stats.USDT = 0;
    stats.DAI = 0;
    updateStats();
}

// Setup event listeners
function setupEventListeners() {
    const pauseBtn = document.getElementById('pause-btn');
    const clearBtn = document.getElementById('clear-btn');
    const connectBtn = document.getElementById('connect-btn');
    
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    });
    
    clearBtn.addEventListener('click', clearParticles);
    
    connectBtn.addEventListener('click', () => {
        if (ws === null) {
            connectWebSocket();
            connectBtn.textContent = 'Disconnect';
        } else {
            disconnectWebSocket();
            connectBtn.textContent = 'Connect';
        }
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
    setupEventListeners();
});