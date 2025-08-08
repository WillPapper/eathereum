import { CONFIG } from './config.js';

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.lights = {};
        this.ground = null;
    }
    
    initialize() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupGround();
        this.setupEventListeners();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    }
    
    setupCamera() {
        const container = document.getElementById('canvas-container');
        let aspect = window.innerWidth / window.innerHeight;
        if (container) {
            const rect = container.getBoundingClientRect();
            aspect = rect.width / rect.height;
        }
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            aspect,
            0.1,
            1000
        );
        this.camera.position.set(0, 20, -30);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        
        const container = document.getElementById('canvas-container');
        if (container) {
            // Size to container
            const rect = container.getBoundingClientRect();
            this.renderer.setSize(rect.width, rect.height);
            container.appendChild(this.renderer.domElement);
        } else {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);
        }
        
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    setupLights() {
        // Ambient light
        this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.lights.ambient);
        
        // Directional light (sun)
        this.lights.directional = new THREE.DirectionalLight(0xffffff, 0.8);
        this.lights.directional.position.set(50, 100, 50);
        this.lights.directional.castShadow = true;
        this.lights.directional.shadow.camera.left = -100;
        this.lights.directional.shadow.camera.right = 100;
        this.lights.directional.shadow.camera.top = 100;
        this.lights.directional.shadow.camera.bottom = -100;
        this.lights.directional.shadow.camera.near = 0.1;
        this.lights.directional.shadow.camera.far = 200;
        this.lights.directional.shadow.mapSize.width = 2048;
        this.lights.directional.shadow.mapSize.height = 2048;
        this.scene.add(this.lights.directional);
        
        // Hemisphere light for better ambient
        this.lights.hemisphere = new THREE.HemisphereLight(
            0x87CEEB, // Sky color
            0x7CFC00, // Ground color (lawn green)
            0.3
        );
        this.scene.add(this.lights.hemisphere);
    }
    
    setupGround() {
        // Create textured ground
        const groundGeometry = new THREE.PlaneGeometry(
            CONFIG.GARDEN_RADIUS * 2,
            CONFIG.GARDEN_RADIUS * 2,
            32,
            32
        );
        
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: 0x7CFC00, // Lawn green
            side: THREE.DoubleSide
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = 0;
        this.ground.receiveShadow = true;
        
        // Add some variation to the ground
        const vertices = this.ground.geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i + 2] = Math.random() * 0.5 - 0.25; // Small height variation
        }
        this.ground.geometry.attributes.position.needsUpdate = true;
        this.ground.geometry.computeVertexNormals();
        
        this.scene.add(this.ground);
        
        // Add border
        this.createBorder();
    }
    
    createBorder() {
        const borderGeometry = new THREE.TorusGeometry(
            CONFIG.GARDEN_RADIUS,
            2,
            8,
            32
        );
        const borderMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B4513, // Saddle brown
            emissive: 0x4A2511,
            emissiveIntensity: 0.2
        });
        
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.y = 1;
        border.rotation.x = -Math.PI / 2;
        border.castShadow = true;
        border.receiveShadow = true;
        
        this.scene.add(border);
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    onWindowResize() {
        const container = document.getElementById('canvas-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            this.camera.aspect = rect.width / rect.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(rect.width, rect.height);
        } else {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    addToScene(object) {
        this.scene.add(object);
    }
    
    removeFromScene(object) {
        this.scene.remove(object);
        
        // Clean up geometry and materials
        if (object.geometry) {
            object.geometry.dispose();
        }
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.dispose());
            } else {
                object.material.dispose();
            }
        }
    }
    
    updateDayNightCycle(time) {
        // Simple day/night cycle effect
        const dayProgress = (Math.sin(time * 0.0001) + 1) / 2;
        
        // Update ambient light intensity
        this.lights.ambient.intensity = 0.3 + dayProgress * 0.3;
        
        // Update directional light
        this.lights.directional.intensity = 0.4 + dayProgress * 0.4;
        
        // Update fog color
        const fogColor = new THREE.Color();
        fogColor.setHSL(0.6, 0.7, 0.3 + dayProgress * 0.4);
        this.scene.fog.color = fogColor;
        this.scene.background = fogColor;
    }
}