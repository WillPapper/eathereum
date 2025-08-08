#!/usr/bin/env node

const redis = require('redis');

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STREAM_KEY = process.env.REDIS_STREAM_KEY || 'stablecoin:transactions';
const PUBLISH_INTERVAL = process.env.PUBLISH_INTERVAL || 2000; // milliseconds

// Stablecoin addresses on Base
const STABLECOINS = {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
};

// Sample addresses for mock transactions
const SAMPLE_ADDRESSES = [
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
    '0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    '0x8103683202aa8DA10536036EDef04CDd865C225E'
];

// Connect to Redis
async function connectRedis() {
    const client = redis.createClient({
        url: REDIS_URL
    });

    client.on('error', (err) => {
        console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
        console.log('Connected to Redis');
    });

    await client.connect();
    return client;
}

// Generate mock transaction data
function generateMockTransaction() {
    const tokens = Object.keys(STABLECOINS);
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const decimals = token === 'DAI' ? 18 : 6;
    
    // Generate realistic amounts (between $10 and $100,000)
    const minAmount = 10;
    const maxAmount = 100000;
    const amount = (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(2);
    
    // Random from and to addresses
    const fromAddress = SAMPLE_ADDRESSES[Math.floor(Math.random() * SAMPLE_ADDRESSES.length)];
    let toAddress = SAMPLE_ADDRESSES[Math.floor(Math.random() * SAMPLE_ADDRESSES.length)];
    
    // Make sure from and to are different
    while (toAddress === fromAddress) {
        toAddress = SAMPLE_ADDRESSES[Math.floor(Math.random() * SAMPLE_ADDRESSES.length)];
    }
    
    // Generate a realistic block number (Base mainnet is around 10M+ blocks)
    const currentBlock = 10000000 + Math.floor(Math.random() * 1000000);
    
    // Generate a random transaction hash
    const txHash = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    return {
        stablecoin: token,
        amount: amount,
        from: fromAddress,
        to: toAddress,
        block_number: currentBlock.toString(),
        tx_hash: txHash
    };
}

// Publish transaction to Redis stream
async function publishTransaction(client, transaction) {
    try {
        const id = await client.xAdd(
            STREAM_KEY,
            '*',
            transaction
        );
        console.log(`Published transaction ${id}:`, {
            token: transaction.stablecoin,
            amount: `$${transaction.amount}`,
            block: transaction.block_number
        });
        return id;
    } catch (error) {
        console.error('Error publishing to Redis stream:', error);
        throw error;
    }
}

// Main loop
async function main() {
    console.log('Starting Mock Redis Publisher...');
    console.log(`Redis URL: ${REDIS_URL}`);
    console.log(`Stream Key: ${STREAM_KEY}`);
    console.log(`Publish Interval: ${PUBLISH_INTERVAL}ms`);
    console.log('-----------------------------------');
    
    const client = await connectRedis();
    
    // Create consumer group if it doesn't exist
    try {
        await client.xGroupCreate(STREAM_KEY, 'websocket-publisher', '$', {
            MKSTREAM: true
        });
        console.log('Created consumer group: websocket-publisher');
    } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
            console.log('Consumer group already exists');
        } else {
            console.error('Error creating consumer group:', error);
        }
    }
    
    console.log('Starting to publish mock transactions...\n');
    
    // Publish transactions at regular intervals
    setInterval(async () => {
        const transaction = generateMockTransaction();
        await publishTransaction(client, transaction);
    }, PUBLISH_INTERVAL);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await client.quit();
        process.exit(0);
    });
}

// Run the publisher
main().catch(console.error);