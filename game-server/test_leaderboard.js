#!/usr/bin/env node

/**
 * Test script for the leaderboard functionality
 * This demonstrates how the frontend would send score updates to the game server
 */

const WebSocket = require('ws');

// Connect to the game server
const ws = new WebSocket('ws://localhost:8080/ws');

ws.on('open', () => {
    console.log('Connected to game server');
    
    // Test 1: Update player score
    console.log('\n📊 Sending score update...');
    ws.send(JSON.stringify({
        type: 'UpdateScore',
        player_name: 'TestPlayer1',
        score: 1250.50,
        animals_eaten: 15
    }));
    
    // Test 2: Send multiple player scores
    setTimeout(() => {
        console.log('\n📊 Sending more player scores...');
        const players = [
            { name: 'Alice', score: 2500.00, animals: 32 },
            { name: 'Bob', score: 1800.75, animals: 22 },
            { name: 'Charlie', score: 3200.25, animals: 41 },
            { name: 'Diana', score: 950.00, animals: 12 },
            { name: 'Eve', score: 4100.50, animals: 55 },
        ];
        
        players.forEach((player, index) => {
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'UpdateScore',
                    player_name: player.name,
                    score: player.score,
                    animals_eaten: player.animals
                }));
            }, index * 100);
        });
    }, 1000);
    
    // Test 3: Request leaderboard
    setTimeout(() => {
        console.log('\n📋 Requesting leaderboard...');
        ws.send(JSON.stringify({
            type: 'GetLeaderboard'
        }));
    }, 3000);
    
    // Test 4: Update existing player score
    setTimeout(() => {
        console.log('\n📊 Updating TestPlayer1 score...');
        ws.send(JSON.stringify({
            type: 'UpdateScore',
            player_name: 'TestPlayer1',
            score: 5500.00,
            animals_eaten: 72
        }));
    }, 4000);
    
    // Test 5: Request leaderboard again
    setTimeout(() => {
        console.log('\n📋 Requesting updated leaderboard...');
        ws.send(JSON.stringify({
            type: 'GetLeaderboard'
        }));
    }, 5000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    
    if (msg.type === 'Leaderboard') {
        console.log('\n🏆 LEADERBOARD:');
        console.log('═══════════════════════════════════════════');
        msg.entries.forEach(entry => {
            console.log(`#${entry.rank} ${entry.player_name.padEnd(15)} Score: ${entry.score.toFixed(2).padStart(10)} | Animals: ${entry.animals_eaten}`);
        });
        console.log('═══════════════════════════════════════════');
    } else if (msg.type === 'ScoreUpdated') {
        console.log(`✅ Score updated: ${msg.player_name} is now rank #${msg.rank} with score ${msg.score}`);
    } else if (msg.type === 'Transaction') {
        // Ignore transaction messages for this test
    } else {
        console.log('Received:', msg);
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('\nDisconnected from game server');
    process.exit(0);
});

// Close connection after 7 seconds
setTimeout(() => {
    console.log('\n👋 Closing connection...');
    ws.close();
}, 7000);

console.log('🎮 Leaderboard Test Script');
console.log('Make sure the game server is running on localhost:8080');