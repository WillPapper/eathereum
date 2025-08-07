// Three.js scene setup
let scene, camera, renderer;
let particles = [];
let isPaused = false;
let ws = null;

// Stablecoin colors - nature-inspired, vibrant colors
const STABLECOIN_COLORS = {
    USDC: 0x4A90E2,  // Sky blue - like morning sky
    USDT: 0x50C878,  // Emerald green - like fresh leaves
    DAI: 0xFFD700   // Golden yellow - like sunflowers
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
        // Particles appear above the garden
        this.mesh.position.x = (Math.random() - 0.5) * 80;
        this.mesh.position.y = 50 + (amountLog * 5); // Higher start for larger amounts
        this.mesh.position.z = (Math.random() - 0.5) * 80;
        
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
        
        // Apply gravity (less for larger amounts) - gentle like falling through air
        this.velocity.y -= 0.008 * (1 / (1 + this.size * 0.2));
        
        // Add slight wind effect
        this.velocity.x += Math.sin(this.age * 0.02) * 0.002;
        this.velocity.z += Math.cos(this.age * 0.015) * 0.002;
        
        // Land on grass (ground at y = -30)
        const groundLevel = -30 + this.size;
        if (this.mesh.position.y < groundLevel) {
            this.mesh.position.y = groundLevel;
            
            // Gentle bounce on grass
            this.velocity.y *= -0.3 * (1 / (1 + this.size * 0.1));
            
            // Add some lateral movement on bounce for variety
            this.velocity.x += (Math.random() - 0.5) * 0.05;
            this.velocity.z += (Math.random() - 0.5) * 0.05;
            
            // Friction on ground
            this.velocity.x *= 0.95;
            this.velocity.z *= 0.95;
            
            // Small particles can "settle" into grass
            if (this.size < 0.5 && Math.abs(this.velocity.y) < 0.1) {
                this.velocity.y = 0;
                this.mesh.position.y = groundLevel - this.size * 0.3;
            }
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

// Garden elements storage
let gardenElements = [];

// Initialize Three.js scene
function init() {
    // Scene with sky gradient
    scene = new THREE.Scene();
    
    // Create gradient background (sky)
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue at top
    gradient.addColorStop(0.4, '#98D8E8'); // Lighter blue
    gradient.addColorStop(0.7, '#FDB777'); // Sunset orange
    gradient.addColorStop(1, '#FDD085'); // Warm horizon
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 512);
    
    const skyTexture = new THREE.CanvasTexture(canvas);
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(0xf0f4f7, 50, 200);
    
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting - more natural for garden
    const ambientLight = new THREE.AmbientLight(0xffefd5, 0.5); // Warm ambient
    scene.add(ambientLight);
    
    // Sun light
    const sunLight = new THREE.DirectionalLight(0xfffaf0, 0.8);
    sunLight.position.set(30, 50, 20);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);
    
    // Create garden floor (grass)
    const grassGeometry = new THREE.PlaneGeometry(200, 200);
    const grassMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x7CBA3F,
        side: THREE.DoubleSide
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -30;
    grass.receiveShadow = true;
    scene.add(grass);
    
    // Create garden elements
    createGardenElements();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Create garden environment
function createGardenElements() {
    // Create trees
    for (let i = 0; i < 8; i++) {
        const tree = createTree();
        const angle = (i / 8) * Math.PI * 2;
        const radius = 60 + Math.random() * 20;
        tree.position.set(
            Math.cos(angle) * radius,
            -30,
            Math.sin(angle) * radius
        );
        tree.scale.set(
            0.8 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4
        );
        scene.add(tree);
        gardenElements.push(tree);
    }
    
    // Create flower patches
    for (let i = 0; i < 15; i++) {
        const flowerPatch = createFlowerPatch();
        flowerPatch.position.set(
            (Math.random() - 0.5) * 100,
            -30,
            (Math.random() - 0.5) * 100
        );
        scene.add(flowerPatch);
        gardenElements.push(flowerPatch);
    }
    
    // Create bushes
    for (let i = 0; i < 10; i++) {
        const bush = createBush();
        bush.position.set(
            (Math.random() - 0.5) * 120,
            -30,
            (Math.random() - 0.5) * 120
        );
        scene.add(bush);
        gardenElements.push(bush);
    }
    
    // Create garden path
    createGardenPath();
}

// Create a tree
function createTree() {
    const tree = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(1.5, 2, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 4;
    trunk.castShadow = true;
    tree.add(trunk);
    
    // Foliage (multiple spheres for organic look)
    const foliageColors = [0x228B22, 0x32CD32, 0x3CB371];
    for (let i = 0; i < 3; i++) {
        const radius = 5 + Math.random() * 2;
        const foliageGeometry = new THREE.SphereGeometry(radius, 8, 6);
        const foliageMaterial = new THREE.MeshLambertMaterial({ 
            color: foliageColors[i]
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(
            (Math.random() - 0.5) * 3,
            10 + i * 2,
            (Math.random() - 0.5) * 3
        );
        foliage.castShadow = true;
        tree.add(foliage);
    }
    
    return tree;
}

// Create flower patch
function createFlowerPatch() {
    const patch = new THREE.Group();
    const flowerColors = [0xFF69B4, 0xFFB6C1, 0xFFA07A, 0xFFFF00, 0xFF1493];
    
    for (let i = 0; i < 5; i++) {
        // Stem
        const stemGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2);
        const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.set(
            (Math.random() - 0.5) * 3,
            1,
            (Math.random() - 0.5) * 3
        );
        
        // Flower
        const flowerGeometry = new THREE.SphereGeometry(0.5, 6, 4);
        const flowerMaterial = new THREE.MeshLambertMaterial({ 
            color: flowerColors[Math.floor(Math.random() * flowerColors.length)]
        });
        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
        flower.position.set(
            stem.position.x,
            2.5,
            stem.position.z
        );
        
        patch.add(stem);
        patch.add(flower);
    }
    
    return patch;
}

// Create bush
function createBush() {
    const bushGeometry = new THREE.SphereGeometry(3, 8, 6);
    const bushMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2F4F2F
    });
    const bush = new THREE.Mesh(bushGeometry, bushMaterial);
    bush.position.y = 2;
    bush.scale.set(1.5, 0.8, 1.5);
    bush.castShadow = true;
    return bush;
}

// Create garden path
function createGardenPath() {
    const pathGeometry = new THREE.PlaneGeometry(10, 100);
    const pathMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xD2B48C,
        side: THREE.DoubleSide
    });
    const path = new THREE.Mesh(pathGeometry, pathMaterial);
    path.rotation.x = -Math.PI / 2;
    path.position.y = -29.9;
    scene.add(path);
    
    // Add stepping stones
    for (let i = -40; i < 40; i += 8) {
        const stoneGeometry = new THREE.CylinderGeometry(2, 2, 0.3, 8);
        const stoneMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x808080
        });
        const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
        stone.position.set(
            (Math.random() - 0.5) * 2,
            -29.8,
            i + (Math.random() - 0.5) * 2
        );
        stone.rotation.x = Math.PI / 2;
        scene.add(stone);
    }
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
    
    // Animate garden elements
    if (!isPaused) {
        const time = Date.now() * 0.0001;
        
        // Gentle camera movement around garden
        camera.position.x = Math.cos(time) * 80;
        camera.position.z = Math.sin(time) * 80;
        camera.position.y = 20 + Math.sin(time * 2) * 5; // Slight vertical movement
        camera.lookAt(0, -10, 0);
        
        // Animate flowers and bushes with gentle sway
        gardenElements.forEach((element, index) => {
            if (element.children.length > 0) {
                // Gentle swaying motion for trees and flowers
                element.rotation.z = Math.sin(time * 2 + index) * 0.02;
                element.rotation.x = Math.cos(time * 1.5 + index) * 0.01;
            }
        });
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