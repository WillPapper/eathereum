# Game Server Refactoring Migration Guide

## Overview
The game server has been refactored from a single 334-line `main.rs` file into a modular architecture with proper separation of concerns. This guide helps you transition to the new structure.

## Architecture Changes

### Before (Monolithic)
```
src/
└── main.rs (334 lines - everything in one file)
```

### After (Modular)
```
src/
├── main.rs (186 lines - clean orchestration)
├── config.rs (configuration management)
├── error.rs (custom error types)
├── health/
│   └── mod.rs (health check server)
├── message/
│   ├── mod.rs
│   └── processor.rs (message processing pipeline)
├── redis/
│   ├── mod.rs
│   ├── consumer.rs (Redis stream consumer)
│   └── stream_message.rs (message parsing)
└── websocket/
    ├── mod.rs
    ├── client_manager.rs (client lifecycle)
    └── handler.rs (connection handling)
```

## Key Improvements

### 1. Configuration Management
- **Before**: Environment variables scattered throughout code
- **After**: Centralized `Config` struct with validation
- **Benefits**: Type-safe configuration, validation at startup, easier testing

### 2. Error Handling
- **Before**: Generic error propagation with `?`
- **After**: Custom `ServerError` enum with context
- **Benefits**: Better error messages, retryable error detection, proper error categorization

### 3. Redis Consumer
- **Before**: Redis logic mixed with WebSocket handling
- **After**: Dedicated `RedisConsumer` struct with consumer groups
- **Benefits**: Reliable message processing, automatic reconnection, consumer group management

### 4. WebSocket Management
- **Before**: Basic WebSocket handling in main loop
- **After**: `ClientManager` with proper lifecycle management
- **Benefits**: Client tracking, broadcast optimization, automatic cleanup of inactive clients

### 5. Message Processing
- **Before**: Inline message handling
- **After**: `MessageProcessor` with metrics and error recovery
- **Benefits**: Metrics tracking, batch processing, configurable retry logic

### 6. Health Monitoring
- **Before**: No health checks
- **After**: Dedicated health server with status endpoint
- **Benefits**: Service monitoring, Redis connection status, client count tracking

## Migration Steps

### 1. Update Dependencies
The refactored code requires additional dependencies:
```toml
[dependencies]
thiserror = "1"
chrono = { version = "0.4", features = ["serde"] }
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
```

### 2. Use the Refactored Main
Replace `src/main.rs` with `src/main_refactored.rs`:
```bash
cp src/main_refactored.rs src/main.rs
```

### 3. Update Environment Variables
New configuration structure with defaults:
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_STREAM_KEY=stablecoin:transactions
CONSUMER_GROUP=websocket-publisher
CONSUMER_NAME=game-server-1
BATCH_SIZE=100
BLOCK_TIMEOUT_MS=1000

# WebSocket Configuration
PORT=8080
CORS_ORIGINS=*
CLIENT_TIMEOUT_SECS=300
PING_INTERVAL_SECS=30

# Health Check
HEALTH_PORT=8081
HEALTH_PATH=/health

# Processing Configuration
STATS_INTERVAL_SECS=30
WARNING_INTERVAL_SECS=60
ADDRESS_DISPLAY_LENGTH=8
```

### 4. Test the Refactored Server
```bash
# Build
cargo build --release

# Run tests
cargo test

# Start the server
cargo run
```

### 5. Verify Health Endpoint
```bash
curl http://localhost:8081/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "redis": true,
    "websocket": {
      "connected_clients": 0
    }
  },
  "metrics": {
    "messages_processed": 0
  }
}
```

## API Compatibility

### WebSocket Endpoint
- **No changes**: `ws://localhost:8080/ws`
- Welcome message now includes client ID
- New commands: `ping` (returns `pong`), `stats` (returns connection stats)

### Message Format
- **No changes**: Same JSON structure for transaction broadcasts
- Messages are now processed in batches for better performance

## Performance Improvements

1. **Batch Processing**: Messages processed in configurable batches
2. **Connection Pooling**: MultiplexedConnection for Redis
3. **Async Processing**: Better concurrent handling of clients
4. **Memory Efficiency**: Reduced allocations with Arc-wrapped shared state

## Monitoring and Debugging

### Logging
Enhanced logging with component-specific levels:
```bash
RUST_LOG=game_server=debug,warp=info cargo run
```

### Metrics
The `MessageProcessor` tracks:
- Messages processed
- Messages failed  
- Batch count
- Processing time

Access metrics via the health endpoint or logs (every 30 seconds by default).

## Rollback Plan

If you need to rollback:
1. Keep `src/main_original.rs` as backup
2. Restore: `cp src/main_original.rs src/main.rs`
3. Rebuild: `cargo build --release`

## Common Issues

### Consumer Group Already Exists
- **Symptom**: Warning about existing consumer group
- **Solution**: This is normal and handled automatically

### Redis Connection Failed
- **Symptom**: Server exits immediately
- **Solution**: Check REDIS_URL and ensure Redis is running

### Port Already in Use
- **Symptom**: "Address already in use" error
- **Solution**: Change PORT or HEALTH_PORT environment variables

## Testing Checklist

- [ ] Server starts without errors
- [ ] Health endpoint responds with 200 OK
- [ ] WebSocket clients can connect
- [ ] Messages are broadcasted to all clients
- [ ] Disconnected clients are cleaned up
- [ ] Redis reconnection works
- [ ] Consumer group is created if missing

## Benefits Summary

1. **Maintainability**: Clear module boundaries, single responsibility
2. **Testability**: Each component can be tested in isolation
3. **Observability**: Health checks, metrics, structured logging
4. **Reliability**: Error recovery, automatic reconnection, graceful shutdown
5. **Performance**: Batch processing, connection pooling, efficient broadcasting
6. **Type Safety**: Strongly typed configuration and error handling

## Next Steps

1. Add integration tests for the refactored modules
2. Implement rate limiting for WebSocket connections
3. Add Prometheus metrics endpoint
4. Consider adding message deduplication
5. Implement configurable backpressure handling