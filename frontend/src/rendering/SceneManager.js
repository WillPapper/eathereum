import * as THREE from 'three';
import Config from '../core/Config.js';
import { EventBus, GameEvents } from '../core/EventBus.js';

export class SceneManager {
    constructor(container) {
        this.container = container || document.body;
        
        // Core Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Lighting
        this.ambientLight = null;
        this.directionalLight = null;
        
        // Environment
        this.ground = null;
        this.fog = null;
        
        // Initialize everything
        this.init();
        this.setupEventListeners();
    }
    
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(Config.environment.skyColor);
        
        // Setup fog
        this.fog = new THREE.Fog(
            Config.environment.skyColor,
            Config.rendering.fogNear,
            Config.rendering.fogFar
        );
        this.scene.fog = this.fog;
        
        // Setup camera
        this.setupCamera();
        
        // Setup renderer
        this.setupRenderer();
        
        // Setup lighting
        this.setupLighting();
        
        // Create environment
        this.createEnvironment();
        
        // Handle window resize
        this.setupResizeHandler();
    }
    
    setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(
            Config.camera.fov,
            aspect,
            Config.camera.near,
            Config.camera.far
        );
        
        // Initial camera position
        this.camera.position.set(0, 30, 50);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Enable shadows if configured
        if (Config.rendering.shadowsEnabled) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        
        // Append to container
        this.container.appendChild(this.renderer.domElement);
    }
    
    setupLighting() {
        // Ambient light for overall illumination
        this.ambientLight = new THREE.AmbientLight(
            Config.rendering.ambientLightColor,
            Config.rendering.ambientLightIntensity
        );
        this.scene.add(this.ambientLight);
        
        // Directional light for shadows and depth
        this.directionalLight = new THREE.DirectionalLight(
            Config.rendering.directionalLightColor,
            Config.rendering.directionalLightIntensity
        );
        
        this.directionalLight.position.set(50, 100, 50);
        this.directionalLight.lookAt(0, 0, 0);
        
        if (Config.rendering.shadowsEnabled) {
            this.directionalLight.castShadow = true;
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            this.directionalLight.shadow.camera.near = 0.5;
            this.directionalLight.shadow.camera.far = 300;
            this.directionalLight.shadow.camera.left = -100;
            this.directionalLight.shadow.camera.right = 100;
            this.directionalLight.shadow.camera.top = 100;
            this.directionalLight.shadow.camera.bottom = -100;
        }
        
        this.scene.add(this.directionalLight);
        
        // Optional: Add hemisphere light for more natural lighting
        const hemisphereLight = new THREE.HemisphereLight(
            0x87CEEB, // Sky color
            0x3a5f3a, // Ground color
            0.3
        );
        this.scene.add(hemisphereLight);
    }
    
    createEnvironment() {
        // Create ground plane
        const groundGeometry = new THREE.PlaneGeometry(
            Config.environment.groundSize,
            Config.environment.groundSize,
            32,
            32
        );
        
        // Add some variation to the ground
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i + 2] = Math.random() * 0.5 - 0.25; // Small height variations
        }
        groundGeometry.computeVertexNormals();
        
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: Config.environment.groundColor,
            side: THREE.DoubleSide
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -30;
        
        if (Config.rendering.shadowsEnabled) {
            this.ground.receiveShadow = true;
        }
        
        this.scene.add(this.ground);
        
        // Add grid for visual reference (optional)
        if (process.env.NODE_ENV === 'development') {
            const gridHelper = new THREE.GridHelper(
                Config.environment.groundSize,
                50,
                0x444444,
                0x222222
            );
            gridHelper.position.y = -29.9;
            this.scene.add(gridHelper);
        }
    }
    
    setupResizeHandler() {
        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        };
        
        window.addEventListener('resize', handleResize);
        
        // Store for cleanup
        this.resizeHandler = handleResize;
    }
    
    setupEventListeners() {
        // Update fog based on game state
        EventBus.on(GameEvents.DIFFICULTY_CHANGE, (difficulty) => {
            if (difficulty === 'survival') {
                // Make fog closer for survival mode
                this.fog.near = 50;
                this.fog.far = 200;
                this.fog.color = new THREE.Color(0x8B4513); // Brownish fog
            } else if (difficulty === 'alliance') {
                // Purple fog for alliance mode
                this.fog.near = 80;
                this.fog.far = 300;
                this.fog.color = new THREE.Color(0x4B0082);
            } else {
                // Normal fog
                this.fog.near = Config.rendering.fogNear;
                this.fog.far = Config.rendering.fogFar;
                this.fog.color = new THREE.Color(Config.environment.skyColor);
            }
            
            this.scene.background = this.fog.color;
        });
        
        // Camera shake effect
        EventBus.on(GameEvents.CAMERA_SHAKE, (data) => {
            this.shakeCamera(data.intensity, data.duration);
        });
        
        // Day/night cycle (optional)
        EventBus.on(GameEvents.ENVIRONMENT_UPDATE, (data) => {
            if (data.timeOfDay) {
                this.updateTimeOfDay(data.timeOfDay);
            }
        });
    }
    
    shakeCamera(intensity = 1, duration = 300) {
        const startTime = Date.now();
        const originalPosition = this.camera.position.clone();
        
        const shake = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < duration) {
                const progress = 1 - (elapsed / duration);
                const shakeAmount = intensity * progress;
                
                this.camera.position.x = originalPosition.x + (Math.random() - 0.5) * shakeAmount;
                this.camera.position.y = originalPosition.y + (Math.random() - 0.5) * shakeAmount;
                this.camera.position.z = originalPosition.z + (Math.random() - 0.5) * shakeAmount;
                
                requestAnimationFrame(shake);
            } else {
                this.camera.position.copy(originalPosition);
            }
        };
        
        shake();
    }
    
    updateTimeOfDay(timeOfDay) {
        // Adjust lighting based on time of day (0-1, where 0 is midnight, 0.5 is noon)
        const sunAngle = timeOfDay * Math.PI * 2;
        const sunHeight = Math.sin(sunAngle);
        const sunX = Math.cos(sunAngle) * 100;
        const sunY = Math.max(sunHeight * 100, 10); // Keep above horizon
        
        this.directionalLight.position.set(sunX, sunY, 50);
        
        // Adjust light intensity
        const dayIntensity = Math.max(0.2, sunHeight);
        this.directionalLight.intensity = Config.rendering.directionalLightIntensity * dayIntensity;
        this.ambientLight.intensity = Config.rendering.ambientLightIntensity * (0.5 + dayIntensity * 0.5);
        
        // Adjust sky color
        if (sunHeight < 0.2) {
            // Night
            this.scene.background = new THREE.Color(0x001133);
            this.fog.color = new THREE.Color(0x001133);
        } else if (sunHeight < 0.3) {
            // Sunrise/sunset
            this.scene.background = new THREE.Color(0xFF6B35);
            this.fog.color = new THREE.Color(0xFF6B35);
        } else {
            // Day
            this.scene.background = new THREE.Color(Config.environment.skyColor);
            this.fog.color = new THREE.Color(Config.environment.skyColor);
        }
    }
    
    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    add(object) {
        this.scene.add(object);
    }
    
    remove(object) {
        this.scene.remove(object);
    }
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
    
    getRenderer() {
        return this.renderer;
    }
    
    dispose() {
        // Remove event listeners
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        
        // Dispose of Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
        
        // Dispose of geometries and materials
        this.scene.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        // Clear scene
        while(this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
    }
}

export default SceneManager;