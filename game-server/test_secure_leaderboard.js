#!/usr/bin/env node

/**
 * Test script for the secure leaderboard functionality
 * Demonstrates the new session-based anti-cheat system
 */

const WebSocket = require('ws');

class GameClient {
    constructor(playerName) {
        this.playerName = playerName;
        this.sessionToken = null;
        this.ws = null;
        this.animalsEaten = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket('ws://localhost:8080/ws');
            
            this.ws.on('open', () => {
                console.log(`✅ ${this.playerName} connected`);
                resolve();
            });
            
            this.ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                this.handleMessage(msg);
            });
            
            this.ws.on('error', (error) => {
                console.error(`❌ ${this.playerName} error:`, error.message);
                reject(error);
            });
            
            this.ws.on('close', () => {
                console.log(`👋 ${this.playerName} disconnected`);
            });
        });
    }
    
    handleMessage(msg) {
        switch(msg.type) {
            case 'SessionStarted':
                this.sessionToken = msg.session_token;
                console.log(`🎮 ${this.playerName} session started`);
                break;
            case 'ScoreUpdated':
                console.log(`📊 ${msg.player_name} is now rank #${msg.rank} with score ${msg.score}`);
                break;
            case 'InvalidAction':
                console.log(`⚠️ ${this.playerName} invalid action: ${msg.reason}`);
                break;
            case 'Leaderboard':
                console.log('\n🏆 LEADERBOARD:');
                console.log('═══════════════════════════════════════════');
                msg.entries.forEach(entry => {
                    console.log(`#${entry.rank} ${entry.player_name.padEnd(15)} Score: ${entry.score.toFixed(2).padStart(10)} | Animals: ${entry.animals_eaten}`);
                });
                console.log('═══════════════════════════════════════════\n');
                break;
        }
    }
    
    startSession() {
        this.ws.send(JSON.stringify({
            type: 'StartSession',
            player_name: this.playerName
        }));
    }
    
    eatAnimal(value) {
        const animalId = `animal_${Date.now()}_${Math.random()}`;
        this.animalsEaten.push(animalId);
        this.ws.send(JSON.stringify({
            type: 'AnimalEaten',
            animal_id: animalId,
            animal_value: value
        }));
    }
    
    die() {
        this.ws.send(JSON.stringify({
            type: 'PlayerDied'
        }));
    }
    
    requestLeaderboard() {
        this.ws.send(JSON.stringify({
            type: 'GetLeaderboard'
        }));
    }
    
    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function legitimatePlayer() {
    console.log('\n=== LEGITIMATE PLAYER TEST ===');
    const player = new GameClient('LegitPlayer');
    await player.connect();
    
    player.startSession();
    await sleep(100);
    
    // Simulate realistic gameplay
    for (let i = 0; i < 10; i++) {
        const value = Math.random() * 100 + 10;
        player.eatAnimal(value);
        await sleep(500 + Math.random() * 500); // Realistic timing
    }
    
    player.die();
    await sleep(100);
    player.requestLeaderboard();
    await sleep(1000);
    player.close();
}

async function cheaterTest() {
    console.log('\n=== CHEATER DETECTION TEST ===');
    const cheater = new GameClient('Cheater');
    await cheater.connect();
    
    cheater.startSession();
    await sleep(100);
    
    console.log('🔥 Attempting rapid eating (should trigger rate limit)...');
    // Try to eat too fast
    for (let i = 0; i < 5; i++) {
        cheater.eatAnimal(100);
        await sleep(50); // Too fast!
    }
    
    await sleep(500);
    
    console.log('💰 Attempting unrealistic value (should be rejected)...');
    // Try unrealistic value
    cheater.eatAnimal(50000);
    
    await sleep(500);
    
    console.log('🔁 Attempting duplicate animal ID (should be rejected)...');
    // Try duplicate animal
    const duplicateId = 'duplicate_animal_123';
    cheater.ws.send(JSON.stringify({
        type: 'AnimalEaten',
        animal_id: duplicateId,
        animal_value: 100
    }));
    await sleep(100);
    cheater.ws.send(JSON.stringify({
        type: 'AnimalEaten',
        animal_id: duplicateId,
        animal_value: 100
    }));
    
    await sleep(1000);
    cheater.close();
}

async function noSessionTest() {
    console.log('\n=== NO SESSION TEST ===');
    const noSession = new GameClient('NoSession');
    await noSession.connect();
    
    console.log('🚫 Attempting to eat without session (should fail)...');
    // Try to eat without starting session
    noSession.eatAnimal(100);
    
    await sleep(500);
    noSession.close();
}

async function multiplePlayersTest() {
    console.log('\n=== MULTIPLE PLAYERS TEST ===');
    
    const players = [
        new GameClient('Alice'),
        new GameClient('Bob'),
        new GameClient('Charlie')
    ];
    
    // Connect all players
    for (const player of players) {
        await player.connect();
        player.startSession();
        await sleep(100);
    }
    
    // Simulate gameplay
    for (let round = 0; round < 5; round++) {
        for (const player of players) {
            const value = Math.random() * 200 + 50;
            player.eatAnimal(value);
            await sleep(300 + Math.random() * 200);
        }
    }
    
    // Request leaderboard
    players[0].requestLeaderboard();
    await sleep(1000);
    
    // Clean up
    for (const player of players) {
        player.die();
        player.close();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🎮 SECURE LEADERBOARD TEST SUITE');
    console.log('==================================');
    console.log('Make sure the game server is running on localhost:8080\n');
    
    try {
        await legitimatePlayer();
        await sleep(1000);
        
        await cheaterTest();
        await sleep(1000);
        
        await noSessionTest();
        await sleep(1000);
        
        await multiplePlayersTest();
        
        console.log('\n✅ All tests completed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    
    process.exit(0);
}

runTests();