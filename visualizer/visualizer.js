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
        this.amount = parseFloat(amount);
        this.from = from;
        this.to = to;
        
        // Calculate size based on amount (logarithmic scale for better visualization)
        // Small transfers: 0.2-0.5, Medium: 0.5-1.5, Large: 1.5-3.0
        const amountLog = Math.log10(this.amount + 1);
        const size = Math.min(Math.max(amountLog * 0.3 + 0.2, 0.2), 3.0);
        
        // Determine detail level based on amount
        const segments = this.amount > 10000 ? 16 : (this.amount > 1000 ? 12 : 8);
        
        // Create main sphere geometry
        const geometry = new THREE.SphereGeometry(size, segments, segments);
        
        // Material changes based on amount
        const baseColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
        
        // For large amounts, use emissive material for glow effect
        const material = this.amount > 5000 ? 
            new THREE.MeshPhongMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: Math.min(this.amount / 50000, 0.5),
                transparent: true,
                opacity: 0.9,
                shininess: 100
            }) :
            new THREE.MeshLambertMaterial({
                color: baseColor,
                transparent: true,
                opacity: Math.min(0.5 + amountLog * 0.1, 0.95)
            });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Add glow effect for very large transfers (>10000)
        if (this.amount > 10000) {
            this.createGlowEffect(baseColor, size);
        }
        
        // Add ring for massive transfers (>50000)
        if (this.amount > 50000) {
            this.createRing(baseColor, size);
        }
        
        // Position based on amount (larger amounts start higher)
        this.mesh.position.x = (Math.random() - 0.5) * 100;
        this.mesh.position.y = 50 + (amountLog * 5); // Higher start for larger amounts
        this.mesh.position.z = (Math.random() - 0.5) * 100;
        
        // Velocity affected by size (larger = slower fall)
        const massFactor = 1 / (1 + size * 0.3);
        this.velocity = {
            x: (Math.random() - 0.5) * 0.5 * massFactor,
            y: -(Math.random() * 0.3 + 0.4) * massFactor,
            z: (Math.random() - 0.5) * 0.5 * massFactor
        };
        
        // Rotation for visual interest (faster for smaller amounts)
        this.rotation = {
            x: (Math.random() - 0.5) * 0.02 / size,
            y: (Math.random() - 0.5) * 0.02 / size,
            z: (Math.random() - 0.5) * 0.02 / size
        };
        
        this.age = 0;
        this.maxAge = 300 + (amountLog * 50); // Larger amounts last longer
        this.size = size;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }
    
    createGlowEffect(color, size) {
        // Create outer glow sphere
        const glowGeometry = new THREE.SphereGeometry(size * 1.5, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        this.mesh.add(this.glowMesh);
    }
    
    createRing(color, size) {
        // Create a ring around massive transfers
        const ringGeometry = new THREE.TorusGeometry(size * 2, size * 0.1, 4, 16);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });
        this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
        this.ring.rotation.x = Math.PI / 2;
        this.mesh.add(this.ring);
    }
    
    update() {
        if (isPaused) return;
        
        // Update position
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.y += this.velocity.y;
        this.mesh.position.z += this.velocity.z;
        
        // Apply rotation
        this.mesh.rotation.x += this.rotation.x;
        this.mesh.rotation.y += this.rotation.y;
        this.mesh.rotation.z += this.rotation.z;
        
        // Apply gravity (less for larger amounts)
        this.velocity.y -= 0.01 * (1 / (1 + this.size * 0.2));
        
        // Bounce off floor with energy loss based on size
        if (this.mesh.position.y < -30 + this.size) {
            this.mesh.position.y = -30 + this.size;
            this.velocity.y *= -0.5 * (1 / (1 + this.size * 0.1));
            
            // Add some lateral movement on bounce for variety
            this.velocity.x += (Math.random() - 0.5) * 0.1;
            this.velocity.z += (Math.random() - 0.5) * 0.1;
        }
        
        // Pulse effect for large amounts
        if (this.amount > 5000) {
            const pulseScale = 1 + Math.sin(this.age * 0.05 + this.pulsePhase) * 0.05;
            this.mesh.scale.set(pulseScale, pulseScale, pulseScale);
            
            // Rotate ring if it exists
            if (this.ring) {
                this.ring.rotation.z += 0.02;
            }
        }
        
        // Update glow intensity based on age
        if (this.glowMesh) {
            const glowIntensity = 0.2 * (1 - this.age / this.maxAge);
            this.glowMesh.material.opacity = glowIntensity;
        }
        
        // Age and fade
        this.age++;
        const fadeStart = this.maxAge * 0.7;
        if (this.age > fadeStart) {
            const fadeProgress = (this.age - fadeStart) / (this.maxAge * 0.3);
            const targetOpacity = this.amount > 5000 ? 0.9 : (0.5 + Math.log10(this.amount + 1) * 0.1);
            this.mesh.material.opacity = targetOpacity * (1 - fadeProgress);
            
            if (this.ring) {
                this.ring.material.opacity = 0.6 * (1 - fadeProgress);
            }
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
            
            // Clean up additional meshes
            if (particle.glowMesh) {
                particle.glowMesh.geometry.dispose();
                particle.glowMesh.material.dispose();
            }
            if (particle.ring) {
                particle.ring.geometry.dispose();
                particle.ring.material.dispose();
            }
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
        
        const transaction = {
            stablecoin: stablecoin,
            amount: amount,
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
        
        // Clean up additional meshes
        if (particle.glowMesh) {
            particle.glowMesh.geometry.dispose();
            particle.glowMesh.material.dispose();
        }
        if (particle.ring) {
            particle.ring.geometry.dispose();
            particle.ring.material.dispose();
        }
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