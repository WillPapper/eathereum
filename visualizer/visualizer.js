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

// Transaction plant class - represents a transaction as a growing plant
class TransactionPlant {
    constructor(stablecoin, amount, from, to) {
        this.stablecoin = stablecoin;
        this.amount = parseFloat(amount);
        this.from = from;
        this.to = to;
        
        // Calculate final size based on amount (logarithmic scale)
        const amountLog = Math.log10(this.amount + 1);
        this.targetHeight = Math.min(Math.max(amountLog * 5 + 2, 2), 30); // Height: 2-30 units
        this.stemWidth = Math.min(Math.max(amountLog * 0.3 + 0.1, 0.1), 2); // Width: 0.1-2 units
        
        // Create plant group
        this.mesh = new THREE.Group();
        
        // Random position in garden
        this.mesh.position.x = (Math.random() - 0.5) * 80;
        this.mesh.position.y = -30; // Start at ground level
        this.mesh.position.z = (Math.random() - 0.5) * 80;
        
        // Get plant color based on stablecoin
        this.baseColor = STABLECOIN_COLORS[stablecoin] || 0xFFFFFF;
        
        // Growth parameters
        this.growthProgress = 0;
        this.growthSpeed = 0.02 + Math.random() * 0.01; // Vary growth speed slightly
        this.swayPhase = Math.random() * Math.PI * 2;
        
        // Create plant based on amount
        if (this.amount < 1000) {
            this.createSmallPlant(); // Small flower
        } else if (this.amount < 10000) {
            this.createMediumPlant(); // Medium bush/flower
        } else if (this.amount < 50000) {
            this.createLargePlant(); // Large flowering plant
        } else {
            this.createGiantPlant(); // Majestic tree
        }
        
        // Start small (will grow)
        this.mesh.scale.set(0.01, 0.01, 0.01);
        
        this.age = 0;
        this.maxAge = 400 + (amountLog * 100); // Larger amounts last longer
        this.isFullyGrown = false;
    }
    
    createSmallPlant() {
        // Small flower with stem
        this.plantType = 'flower';
        
        // Stem
        const stemGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 0.5, 
            this.stemWidth, 
            this.targetHeight
        );
        const stemMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2D5016 // Dark green stem
        });
        this.stem = new THREE.Mesh(stemGeometry, stemMaterial);
        this.stem.position.y = this.targetHeight / 2;
        this.stem.castShadow = true;
        this.mesh.add(this.stem);
        
        // Flower petals (multiple small spheres)
        const petalCount = 5 + Math.floor(Math.random() * 3);
        this.petals = [];
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeometry = new THREE.SphereGeometry(this.stemWidth * 2, 6, 4);
            const petalMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.2
            });
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.position.set(
                Math.cos(angle) * this.stemWidth * 3,
                this.targetHeight,
                Math.sin(angle) * this.stemWidth * 3
            );
            petal.scale.set(1, 0.6, 1);
            this.petals.push(petal);
            this.mesh.add(petal);
        }
        
        // Center of flower
        const centerGeometry = new THREE.SphereGeometry(this.stemWidth * 1.5, 8, 6);
        const centerMaterial = new THREE.MeshLambertMaterial({
            color: 0xFFFF00 // Yellow center
        });
        this.center = new THREE.Mesh(centerGeometry, centerMaterial);
        this.center.position.y = this.targetHeight;
        this.mesh.add(this.center);
    }
    
    createMediumPlant() {
        // Medium flowering bush
        this.plantType = 'bush';
        
        // Main bush body (multiple spheres)
        const bushParts = 3 + Math.floor(Math.random() * 2);
        this.bushes = [];
        for (let i = 0; i < bushParts; i++) {
            const bushGeometry = new THREE.SphereGeometry(
                this.targetHeight / 3 + Math.random() * 2, 
                8, 
                6
            );
            const bushMaterial = new THREE.MeshLambertMaterial({
                color: 0x2F4F2F // Dark green
            });
            const bush = new THREE.Mesh(bushGeometry, bushMaterial);
            bush.position.set(
                (Math.random() - 0.5) * this.targetHeight / 3,
                this.targetHeight / 3 + i * 2,
                (Math.random() - 0.5) * this.targetHeight / 3
            );
            bush.castShadow = true;
            this.bushes.push(bush);
            this.mesh.add(bush);
        }
        
        // Add flowers on bush
        const flowerCount = 5 + Math.floor(this.amount / 2000);
        this.flowers = [];
        for (let i = 0; i < flowerCount; i++) {
            const flowerGeometry = new THREE.SphereGeometry(0.8, 6, 4);
            const flowerMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.3
            });
            const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
            const angle = Math.random() * Math.PI * 2;
            const radius = this.targetHeight / 3 + Math.random() * 2;
            flower.position.set(
                Math.cos(angle) * radius,
                this.targetHeight / 2 + Math.random() * this.targetHeight / 2,
                Math.sin(angle) * radius
            );
            this.flowers.push(flower);
            this.mesh.add(flower);
        }
    }
    
    createLargePlant() {
        // Large ornamental plant with trunk and flowers
        this.plantType = 'ornamental';
        
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 2,
            this.stemWidth * 3,
            this.targetHeight * 0.6
        );
        const trunkMaterial = new THREE.MeshLambertMaterial({
            color: 0x4A3C28 // Brown trunk
        });
        this.trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        this.trunk.position.y = this.targetHeight * 0.3;
        this.trunk.castShadow = true;
        this.mesh.add(this.trunk);
        
        // Foliage layers
        const layers = 3;
        this.foliage = [];
        for (let i = 0; i < layers; i++) {
            const layerGeometry = new THREE.ConeGeometry(
                this.targetHeight / 2.5 - i * 2,
                this.targetHeight / 4,
                8
            );
            const layerMaterial = new THREE.MeshLambertMaterial({
                color: 0x228B22
            });
            const layer = new THREE.Mesh(layerGeometry, layerMaterial);
            layer.position.y = this.targetHeight * 0.5 + i * this.targetHeight / 6;
            layer.castShadow = true;
            this.foliage.push(layer);
            this.mesh.add(layer);
        }
        
        // Large flowers
        const flowerCount = Math.floor(this.amount / 5000);
        this.flowers = [];
        for (let i = 0; i < flowerCount; i++) {
            const flowerGeometry = new THREE.SphereGeometry(1.5, 8, 6);
            const flowerMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.4
            });
            const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
            const angle = (i / flowerCount) * Math.PI * 2;
            flower.position.set(
                Math.cos(angle) * this.targetHeight / 3,
                this.targetHeight * 0.7 + Math.random() * this.targetHeight * 0.2,
                Math.sin(angle) * this.targetHeight / 3
            );
            this.flowers.push(flower);
            this.mesh.add(flower);
        }
    }
    
    createGiantPlant() {
        // Majestic tree for whale transactions
        this.plantType = 'tree';
        
        // Thick trunk
        const trunkGeometry = new THREE.CylinderGeometry(
            this.stemWidth * 3,
            this.stemWidth * 4,
            this.targetHeight * 0.5
        );
        const trunkMaterial = new THREE.MeshLambertMaterial({
            color: 0x654321
        });
        this.trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        this.trunk.position.y = this.targetHeight * 0.25;
        this.trunk.castShadow = true;
        this.mesh.add(this.trunk);
        
        // Crown (multiple large spheres)
        const crownParts = 5;
        this.crown = [];
        for (let i = 0; i < crownParts; i++) {
            const crownGeometry = new THREE.SphereGeometry(
                this.targetHeight / 3 + Math.random() * 3,
                12,
                8
            );
            const crownMaterial = new THREE.MeshLambertMaterial({
                color: 0x0F7938
            });
            const crownPart = new THREE.Mesh(crownGeometry, crownMaterial);
            const angle = (i / crownParts) * Math.PI * 2;
            crownPart.position.set(
                Math.cos(angle) * this.targetHeight / 6,
                this.targetHeight * 0.6 + Math.random() * this.targetHeight * 0.2,
                Math.sin(angle) * this.targetHeight / 6
            );
            crownPart.castShadow = true;
            this.crown.push(crownPart);
            this.mesh.add(crownPart);
        }
        
        // Glowing fruits for massive transactions
        const fruitCount = Math.floor(this.amount / 20000);
        this.fruits = [];
        for (let i = 0; i < fruitCount; i++) {
            const fruitGeometry = new THREE.SphereGeometry(1, 8, 6);
            const fruitMaterial = new THREE.MeshPhongMaterial({
                color: this.baseColor,
                emissive: this.baseColor,
                emissiveIntensity: 0.6
            });
            const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
            const angle = Math.random() * Math.PI * 2;
            const height = this.targetHeight * 0.5 + Math.random() * this.targetHeight * 0.3;
            const radius = Math.random() * this.targetHeight / 3;
            fruit.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            this.fruits.push(fruit);
            this.mesh.add(fruit);
        }
        
        // Add aura for whale transactions
        if (this.amount > 100000) {
            const auraGeometry = new THREE.SphereGeometry(this.targetHeight * 0.8, 16, 12);
            const auraMaterial = new THREE.MeshBasicMaterial({
                color: this.baseColor,
                transparent: true,
                opacity: 0.1,
                side: THREE.BackSide
            });
            this.aura = new THREE.Mesh(auraGeometry, auraMaterial);
            this.aura.position.y = this.targetHeight * 0.6;
            this.mesh.add(this.aura);
        }
    }
    
    update() {
        if (isPaused) return;
        
        // Grow the plant
        if (this.growthProgress < 1) {
            this.growthProgress = Math.min(this.growthProgress + this.growthSpeed, 1);
            
            // Smooth growth curve (ease-out)
            const growthCurve = 1 - Math.pow(1 - this.growthProgress, 3);
            this.mesh.scale.set(growthCurve, growthCurve, growthCurve);
            
            // Mark as fully grown
            if (this.growthProgress >= 1) {
                this.isFullyGrown = true;
            }
        }
        
        // Sway animation (wind effect)
        const swayAmount = this.isFullyGrown ? 0.03 : 0.01;
        const time = Date.now() * 0.001;
        this.mesh.rotation.z = Math.sin(time + this.swayPhase) * swayAmount;
        this.mesh.rotation.x = Math.cos(time * 0.7 + this.swayPhase) * swayAmount * 0.5;
        
        // Animate specific plant parts
        if (this.plantType === 'flower' && this.petals) {
            // Petals open and close slightly
            this.petals.forEach((petal, i) => {
                const petalPhase = i * 0.5;
                petal.scale.y = 0.6 + Math.sin(time * 0.5 + petalPhase) * 0.1;
            });
        } else if (this.plantType === 'tree' && this.fruits) {
            // Fruits bob slightly
            this.fruits.forEach((fruit, i) => {
                fruit.position.y += Math.sin(time * 2 + i) * 0.01;
            });
            
            // Pulse aura for whale transactions
            if (this.aura) {
                this.aura.material.opacity = 0.1 + Math.sin(time * 3) * 0.05;
                this.aura.scale.set(
                    1 + Math.sin(time * 2) * 0.1,
                    1 + Math.sin(time * 2) * 0.1,
                    1 + Math.sin(time * 2) * 0.1
                );
            }
        } else if (this.flowers) {
            // Flowers on bushes/ornamental plants glow pulse
            this.flowers.forEach((flower, i) => {
                if (flower.material.emissiveIntensity !== undefined) {
                    flower.material.emissiveIntensity = 0.3 + Math.sin(time * 2 + i * 0.5) * 0.2;
                }
            });
        }
        
        // Age and fade
        this.age++;
        const fadeStart = this.maxAge * 0.8;
        if (this.age > fadeStart) {
            const fadeProgress = (this.age - fadeStart) / (this.maxAge * 0.2);
            
            // Fade all materials in the plant
            this.mesh.traverse((child) => {
                if (child.material) {
                    if (child.material.opacity !== undefined) {
                        child.material.transparent = true;
                        child.material.opacity = Math.max(0, 1 - fadeProgress);
                    }
                }
            });
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

// Add a new transaction plant
function addTransaction(data) {
    const plant = new TransactionPlant(
        data.stablecoin,
        data.amount,
        data.from,
        data.to
    );
    
    particles.push(plant);
    scene.add(plant.mesh);
    
    // Update statistics
    stats.total++;
    stats[data.stablecoin]++;
    updateStats();
    
    // Play a sprouting sound effect (optional)
    // You could add sound effects here if desired
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
    
    // Update plants
    particles = particles.filter(plant => {
        const alive = plant.update();
        if (!alive) {
            scene.remove(plant.mesh);
            
            // Dispose of all geometries and materials in the plant
            plant.mesh.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
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

// Clear all plants
function clearParticles() {
    particles.forEach(plant => {
        scene.remove(plant.mesh);
        
        // Dispose of all geometries and materials in the plant
        plant.mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
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