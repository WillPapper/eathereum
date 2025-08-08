import * as THREE from 'three';
import Config from '../core/Config.js';

class AssetFactoryClass {
    constructor() {
        // Cache for reusable geometries
        this.geometryCache = new Map();
        
        // Cache for reusable materials
        this.materialCache = new Map();
        
        // Cache for textures
        this.textureCache = new Map();
        
        // Performance settings
        this.useSimplifiedGeometry = false;
        this.entityCount = 0;
    }
    
    // Geometry creation with caching
    getSphereGeometry(radius, segments = null) {
        // Auto-adjust segments based on performance
        if (segments === null) {
            segments = this.useSimplifiedGeometry ? 6 : 8;
        }
        
        const key = `sphere_${radius}_${segments}`;
        if (!this.geometryCache.has(key)) {
            this.geometryCache.set(key, new THREE.SphereGeometry(radius, segments, segments));
        }
        return this.geometryCache.get(key);
    }
    
    getCylinderGeometry(radiusTop, radiusBottom, height, segments = null) {
        if (segments === null) {
            segments = this.useSimplifiedGeometry ? 4 : 8;
        }
        
        const key = `cylinder_${radiusTop}_${radiusBottom}_${height}_${segments}`;
        if (!this.geometryCache.has(key)) {
            this.geometryCache.set(key, new THREE.CylinderGeometry(
                radiusTop, radiusBottom, height, segments
            ));
        }
        return this.geometryCache.get(key);
    }
    
    getConeGeometry(radius, height, segments = null) {
        if (segments === null) {
            segments = this.useSimplifiedGeometry ? 4 : 8;
        }
        
        const key = `cone_${radius}_${height}_${segments}`;
        if (!this.geometryCache.has(key)) {
            this.geometryCache.set(key, new THREE.ConeGeometry(radius, height, segments));
        }
        return this.geometryCache.get(key);
    }
    
    getBoxGeometry(width, height, depth) {
        const key = `box_${width}_${height}_${depth}`;
        if (!this.geometryCache.has(key)) {
            this.geometryCache.set(key, new THREE.BoxGeometry(width, height, depth));
        }
        return this.geometryCache.get(key);
    }
    
    // Material creation with caching
    getMaterial(type, options) {
        const key = `${type}_${JSON.stringify(options)}`;
        
        if (!this.materialCache.has(key)) {
            let material;
            
            switch(type) {
                case 'phong':
                    material = new THREE.MeshPhongMaterial(options);
                    break;
                case 'lambert':
                    material = new THREE.MeshLambertMaterial(options);
                    break;
                case 'basic':
                    material = new THREE.MeshBasicMaterial(options);
                    break;
                case 'standard':
                    material = new THREE.MeshStandardMaterial(options);
                    break;
                default:
                    material = new THREE.MeshLambertMaterial(options);
            }
            
            this.materialCache.set(key, material);
        }
        
        return this.materialCache.get(key);
    }
    
    // Create animal mesh
    createAnimal(size, color, stablecoin = 'USDC') {
        const group = new THREE.Group();
        
        // Use appropriate material based on performance
        const materialType = this.useSimplifiedGeometry ? 'lambert' : 'phong';
        
        // Body
        const bodyGeometry = this.getSphereGeometry(size);
        const bodyMaterial = this.getMaterial(materialType, {
            color: color || Config.stablecoins.colors[stablecoin],
            emissive: color || Config.stablecoins.colors[stablecoin],
            emissiveIntensity: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = size;
        body.castShadow = !this.useSimplifiedGeometry;
        group.add(body);
        
        // Eyes (simplified if needed)
        if (!this.useSimplifiedGeometry) {
            for (let i = -1; i <= 1; i += 2) {
                // Eye white
                const eyeGeometry = this.getSphereGeometry(size * 0.15, 4);
                const eyeMaterial = this.getMaterial('basic', { color: 0xFFFFFF });
                const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
                eye.position.set(size * 0.3, size * 1.2, i * size * 0.4);
                group.add(eye);
                
                // Pupil
                const pupilGeometry = this.getSphereGeometry(size * 0.08, 4);
                const pupilMaterial = this.getMaterial('basic', { color: 0x000000 });
                const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
                pupil.position.set(size * 0.4, size * 1.2, i * size * 0.4);
                group.add(pupil);
            }
        }
        
        return group;
    }
    
    // Create plant mesh based on size
    createPlant(amount, stablecoin) {
        const group = new THREE.Group();
        const color = Config.stablecoins.colors[stablecoin] || 0xFFFFFF;
        
        // Calculate size based on amount
        const amountLog = Math.log10(amount + 1);
        const height = Math.min(Math.max(amountLog * 5 + 2, 2), 30);
        const width = Math.min(Math.max(amountLog * 0.3 + 0.1, 0.1), 2);
        
        if (amount < Config.plants.sizeThresholds.small) {
            // Small flower
            return this.createFlower(height, width, color);
        } else if (amount < Config.plants.sizeThresholds.medium) {
            // Medium bush
            return this.createBush(height, width, color);
        } else if (amount < Config.plants.sizeThresholds.large) {
            // Large plant
            return this.createLargePlant(height, width, color);
        } else {
            // Giant tree
            return this.createTree(height, width, color);
        }
    }
    
    createFlower(height, width, color) {
        const group = new THREE.Group();
        
        // Stem
        const stemGeometry = this.getCylinderGeometry(width * 0.5, width, height);
        const stemMaterial = this.getMaterial('lambert', { color: 0x2D5016 });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = height / 2;
        group.add(stem);
        
        // Flower petals
        const petalCount = 5;
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeometry = this.getSphereGeometry(width * 2, 4);
            const petalMaterial = this.getMaterial('lambert', { color });
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.position.set(
                Math.cos(angle) * width * 3,
                height,
                Math.sin(angle) * width * 3
            );
            petal.scale.set(1.5, 0.7, 1);
            group.add(petal);
        }
        
        // Center
        const centerGeometry = this.getSphereGeometry(width * 1.5, 4);
        const centerMaterial = this.getMaterial('lambert', { color: 0xFFFF00 });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.position.y = height;
        group.add(center);
        
        return group;
    }
    
    createBush(height, width, color) {
        const group = new THREE.Group();
        
        // Multiple spheres for bushy appearance
        const sphereCount = 5;
        for (let i = 0; i < sphereCount; i++) {
            const size = height * 0.3 * (1 + Math.random() * 0.3);
            const geometry = this.getSphereGeometry(size, 6);
            const material = this.getMaterial('lambert', { 
                color: i === 0 ? color : 0x2D5016
            });
            const sphere = new THREE.Mesh(geometry, material);
            
            const angle = (i / sphereCount) * Math.PI * 2;
            const radius = width * 2;
            sphere.position.set(
                Math.cos(angle) * radius * Math.random(),
                height * 0.5 + Math.random() * height * 0.3,
                Math.sin(angle) * radius * Math.random()
            );
            
            group.add(sphere);
        }
        
        return group;
    }
    
    createLargePlant(height, width, color) {
        const group = new THREE.Group();
        
        // Trunk
        const trunkGeometry = this.getCylinderGeometry(width, width * 1.5, height * 0.4);
        const trunkMaterial = this.getMaterial('lambert', { color: 0x4A3C28 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = height * 0.2;
        group.add(trunk);
        
        // Canopy
        const canopyGeometry = this.getSphereGeometry(height * 0.4, 8);
        const canopyMaterial = this.getMaterial('lambert', { color });
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.position.y = height * 0.6;
        canopy.scale.y = 1.5;
        group.add(canopy);
        
        return group;
    }
    
    createTree(height, width, color) {
        const group = new THREE.Group();
        
        // Trunk
        const trunkGeometry = this.getCylinderGeometry(width * 2, width * 3, height * 0.5);
        const trunkMaterial = this.getMaterial('lambert', { color: 0x4A3C28 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = height * 0.25;
        trunk.castShadow = true;
        group.add(trunk);
        
        // Multiple canopy layers
        const layers = 3;
        for (let i = 0; i < layers; i++) {
            const layerSize = height * 0.3 * (1 - i * 0.2);
            const layerGeometry = this.getConeGeometry(layerSize, layerSize * 1.5);
            const layerMaterial = this.getMaterial('lambert', { 
                color: i === 0 ? color : 0x2D5016
            });
            const layer = new THREE.Mesh(layerGeometry, layerMaterial);
            layer.position.y = height * (0.5 + i * 0.2);
            layer.castShadow = true;
            group.add(layer);
        }
        
        return group;
    }
    
    // Create power-up fruit
    createPowerUpFruit(type) {
        const group = new THREE.Group();
        
        let color, glowColor, shape;
        
        switch(type) {
            case 'life':
                color = 0xFF69B4; // Pink
                glowColor = 0xFF1493;
                shape = 'heart';
                break;
            case 'leverage':
                color = 0xFFD700; // Gold
                glowColor = 0xFFA500;
                shape = 'star';
                break;
            case 'speedrun':
                color = 0x00CED1; // Turquoise
                glowColor = 0x00FFFF;
                shape = 'lightning';
                break;
            default:
                color = 0xFFFFFF;
                glowColor = 0xFFFFFF;
                shape = 'sphere';
        }
        
        // Main fruit body
        const geometry = shape === 'sphere' 
            ? this.getSphereGeometry(1.5, 8)
            : this.createSpecialShape(shape);
            
        const material = this.getMaterial('phong', {
            color,
            emissive: glowColor,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.9
        });
        
        const fruit = new THREE.Mesh(geometry, material);
        fruit.castShadow = true;
        group.add(fruit);
        
        // Add glow effect
        const glowGeometry = this.getSphereGeometry(2, 6);
        const glowMaterial = this.getMaterial('basic', {
            color: glowColor,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);
        
        return group;
    }
    
    createSpecialShape(shape) {
        switch(shape) {
            case 'heart':
                // Simplified heart shape using spheres
                const heartGeometry = new THREE.Group();
                // This would be more complex in reality
                return this.getSphereGeometry(1.5, 8);
                
            case 'star':
                // Simplified star shape
                return new THREE.OctahedronGeometry(1.5, 0);
                
            case 'lightning':
                // Simplified lightning bolt
                return new THREE.TetrahedronGeometry(1.5, 0);
                
            default:
                return this.getSphereGeometry(1.5, 8);
        }
    }
    
    // Create border tree
    createBorderTree() {
        const treeColors = Config.environment.treeColors;
        const color = treeColors[Math.floor(Math.random() * treeColors.length)];
        const height = 15 + Math.random() * 10;
        const width = 2 + Math.random();
        
        return this.createTree(height, width, color);
    }
    
    // Update performance settings
    updatePerformanceSettings(entityCount) {
        this.entityCount = entityCount;
        this.useSimplifiedGeometry = entityCount > Config.performance.simplifiedGeometryThreshold;
    }
    
    // Dispose of cached resources
    dispose() {
        // Dispose geometries
        this.geometryCache.forEach(geometry => geometry.dispose());
        this.geometryCache.clear();
        
        // Dispose materials
        this.materialCache.forEach(material => material.dispose());
        this.materialCache.clear();
        
        // Dispose textures
        this.textureCache.forEach(texture => texture.dispose());
        this.textureCache.clear();
    }
    
    // Get cache statistics
    getCacheStats() {
        return {
            geometries: this.geometryCache.size,
            materials: this.materialCache.size,
            textures: this.textureCache.size,
            useSimplified: this.useSimplifiedGeometry,
            entityCount: this.entityCount
        };
    }
}

// Create singleton instance
export const AssetFactory = new AssetFactoryClass();
export default AssetFactory;