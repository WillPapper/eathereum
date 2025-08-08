class EventBusClass {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.debug = false; // Enable for event debugging
    }
    
    on(event, callback, context = null) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push({ callback, context });
        
        if (this.debug) {
            console.log(`[EventBus] Listener added for: ${event}`);
        }
        
        return () => this.off(event, callback);
    }
    
    once(event, callback, context = null) {
        if (!this.onceEvents.has(event)) {
            this.onceEvents.set(event, []);
        }
        this.onceEvents.get(event).push({ callback, context });
        
        return () => this.off(event, callback);
    }
    
    off(event, callback) {
        if (this.events.has(event)) {
            const listeners = this.events.get(event);
            const index = listeners.findIndex(l => l.callback === callback);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.events.delete(event);
                }
            }
        }
        
        if (this.onceEvents.has(event)) {
            const listeners = this.onceEvents.get(event);
            const index = listeners.findIndex(l => l.callback === callback);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.onceEvents.delete(event);
                }
            }
        }
    }
    
    emit(event, data = null) {
        if (this.debug) {
            console.log(`[EventBus] Event emitted: ${event}`, data);
        }
        
        // Handle regular listeners
        if (this.events.has(event)) {
            const listeners = [...this.events.get(event)];
            listeners.forEach(({ callback, context }) => {
                try {
                    callback.call(context, data);
                } catch (error) {
                    console.error(`[EventBus] Error in listener for ${event}:`, error);
                }
            });
        }
        
        // Handle once listeners
        if (this.onceEvents.has(event)) {
            const listeners = [...this.onceEvents.get(event)];
            this.onceEvents.delete(event);
            listeners.forEach(({ callback, context }) => {
                try {
                    callback.call(context, data);
                } catch (error) {
                    console.error(`[EventBus] Error in once listener for ${event}:`, error);
                }
            });
        }
    }
    
    clear(event = null) {
        if (event) {
            this.events.delete(event);
            this.onceEvents.delete(event);
        } else {
            this.events.clear();
            this.onceEvents.clear();
        }
    }
    
    hasListeners(event) {
        return this.events.has(event) || this.onceEvents.has(event);
    }
    
    getListenerCount(event) {
        let count = 0;
        if (this.events.has(event)) {
            count += this.events.get(event).length;
        }
        if (this.onceEvents.has(event)) {
            count += this.onceEvents.get(event).length;
        }
        return count;
    }
}

// Create singleton instance
export const EventBus = new EventBusClass();

// Game Events Constants
export const GameEvents = {
    // Player events
    PLAYER_SPAWN: 'player.spawn',
    PLAYER_MOVE: 'player.move',
    PLAYER_GROW: 'player.grow',
    PLAYER_SHRINK: 'player.shrink',
    PLAYER_DIE: 'player.die',
    PLAYER_RESPAWN: 'player.respawn',
    PLAYER_BOOST: 'player.boost',
    
    // Animal events
    ANIMAL_SPAWN: 'animal.spawn',
    ANIMAL_EATEN: 'animal.eaten',
    ANIMAL_FLEE: 'animal.flee',
    ANIMAL_CHASE: 'animal.chase',
    ANIMAL_ALLIANCE: 'animal.alliance',
    ANIMAL_DESPAWN: 'animal.despawn',
    
    // Plant events
    PLANT_SPAWN: 'plant.spawn',
    PLANT_GROW: 'plant.grow',
    PLANT_MATURE: 'plant.mature',
    PLANT_REMOVE: 'plant.remove',
    
    // Power-up events
    POWERUP_SPAWN: 'powerup.spawn',
    POWERUP_COLLECTED: 'powerup.collected',
    POWERUP_EXPIRED: 'powerup.expired',
    POWERUP_ACTIVATED: 'powerup.activated',
    POWERUP_DEACTIVATED: 'powerup.deactivated',
    
    // Collision events
    COLLISION_PLAYER_ANIMAL: 'collision.player.animal',
    COLLISION_PLAYER_POWERUP: 'collision.player.powerup',
    COLLISION_ANIMAL_ANIMAL: 'collision.animal.animal',
    COLLISION_PLAYER_PLANT: 'collision.player.plant',
    
    // Game state events
    GAME_START: 'game.start',
    GAME_PAUSE: 'game.pause',
    GAME_RESUME: 'game.resume',
    GAME_OVER: 'game.over',
    GAME_RESTART: 'game.restart',
    
    // Score events
    SCORE_UPDATE: 'score.update',
    HIGH_SCORE_ACHIEVED: 'score.high',
    MONEY_COLLECTED: 'money.collected',
    
    // Difficulty events
    DIFFICULTY_CHANGE: 'difficulty.change',
    SURVIVAL_MODE_START: 'difficulty.survival.start',
    SURVIVAL_MODE_END: 'difficulty.survival.end',
    ALLIANCE_MODE_START: 'difficulty.alliance.start',
    ALLIANCE_MODE_END: 'difficulty.alliance.end',
    
    // UI events
    UI_NOTIFICATION: 'ui.notification',
    UI_UPDATE_HUD: 'ui.update.hud',
    UI_SHOW_MENU: 'ui.show.menu',
    UI_HIDE_MENU: 'ui.hide.menu',
    UI_FULLSCREEN_TOGGLE: 'ui.fullscreen.toggle',
    
    // WebSocket events
    WS_CONNECTED: 'ws.connected',
    WS_DISCONNECTED: 'ws.disconnected',
    WS_TRANSACTION: 'ws.transaction',
    WS_ERROR: 'ws.error',
    
    // Camera events
    CAMERA_UPDATE: 'camera.update',
    CAMERA_SHAKE: 'camera.shake',
    CAMERA_ZOOM: 'camera.zoom',
    
    // Environment events
    ENVIRONMENT_TREE_SPAWN: 'environment.tree.spawn',
    ENVIRONMENT_UPDATE: 'environment.update',
    
    // Mobile events
    MOBILE_JOYSTICK_MOVE: 'mobile.joystick.move',
    MOBILE_TOUCH_START: 'mobile.touch.start',
    MOBILE_TOUCH_END: 'mobile.touch.end',
    
    // System events
    SYSTEM_ERROR: 'system.error',
    SYSTEM_WARNING: 'system.warning',
    SYSTEM_INFO: 'system.info'
};

export default EventBus;