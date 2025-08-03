# Dashboard Backend Test Suite

## Overview
This test suite ensures the reliability and stability of the Home Assistant Dashboard backend through comprehensive unit, integration, and connection tests.

## Test Structure

```
tests/
├── README.md                    # This file
├── unit/                        # Unit tests for individual components
│   ├── device-service.test.js   # Device parsing and categorization logic
│   ├── mcp-client.test.js       # MCP client functionality
│   └── utils.test.js            # Utility functions
├── integration/                 # Integration tests for API endpoints
│   ├── api-endpoints.test.js    # REST API endpoint tests
│   ├── websocket.test.js        # WebSocket functionality tests
│   └── error-handling.test.js   # Error scenarios and fallbacks
├── connection/                  # Connection and data retrieval tests
│   ├── mcp-connection.test.js   # MCP server connection tests
│   ├── live-data.test.js        # Live data retrieval tests
│   └── device-control.test.js   # Device control command tests
├── fixtures/                    # Test data and mock responses
│   ├── mock-mcp-responses.js    # Sample MCP server responses
│   ├── sample-devices.js        # Device state samples
│   └── test-scenarios.js        # Complex test scenarios
└── setup/                       # Test configuration and helpers
    ├── test-config.js           # Test environment configuration
    ├── mcp-mock-server.js       # Mock MCP server for testing
    └── test-helpers.js          # Common test utilities
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)
Tests individual functions and components in isolation.

#### Device Service Tests
- ✅ `parseLiveContext()` - Parse MCP responses into device objects
- ✅ `categorizeDevices()` - Group devices by type (lights, doors, climate, etc.)
- ✅ `calculateAverageTemperature()` - Temperature calculation logic
- ✅ `findDeviceById()` - Device lookup functionality
- ✅ Device state management and caching

#### MCP Client Tests
- ✅ Connection initialization and cleanup
- ✅ Request/response handling
- ✅ Error handling and timeouts
- ✅ Protocol compliance (JSON-RPC 2.0)

### 2. Integration Tests (`tests/integration/`)
Tests how components work together.

#### API Endpoint Tests
- ✅ `GET /api/dashboard/state` - Dashboard state endpoint
- ✅ `POST /api/devices/:id/toggle` - Device control endpoints
- ✅ `POST /api/devices/:id/brightness` - Light brightness control
- ✅ `POST /api/devices/:id/temperature` - Climate control
- ✅ WebSocket connection and message broadcasting

#### Error Handling Tests
- ✅ Graceful fallback to mock data when MCP unavailable
- ✅ API error responses (4xx, 5xx status codes)
- ✅ Invalid device ID handling
- ✅ Malformed request handling

### 3. Connection Tests (`tests/connection/`)
Tests external service connections and data flow.

#### MCP Connection Tests
- ✅ Successful connection to MCP server
- ✅ Authentication and authorization
- ✅ Connection recovery after failure
- ✅ Timeout handling

#### Live Data Tests
- ✅ Real-time device state retrieval
- ✅ Data format validation
- ✅ Large dataset handling
- ✅ Refresh rate and caching

#### Device Control Tests
- ✅ Turn devices on/off via MCP
- ✅ Set device properties (brightness, temperature)
- ✅ Control validation and feedback
- ✅ Command queueing and retry logic

## Running Tests

### Prerequisites
```bash
cd /Users/jason/homeassistant-dashboard/backend
npm install --save-dev jest supertest
```

### Test Commands
```bash
# Run all tests
npm test

# Run specific test category
npm run test:unit
npm run test:integration
npm run test:connection

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch
```

## Test Data and Mocking

### Mock MCP Server
For testing without requiring the actual MCP server, we provide a mock server that simulates MCP responses:

```javascript
// tests/setup/mcp-mock-server.js
const mockServer = require('./setup/mcp-mock-server');
// Provides realistic MCP responses for testing
```

### Test Fixtures
Sample data for consistent testing:

```javascript
// tests/fixtures/sample-devices.js
module.exports = {
  lights: [...],
  doors: [...],
  climate: [...],
  // Organized by device type
};
```

## Continuous Integration

Tests run automatically on:
- ✅ Every commit to main branch
- ✅ Pull request creation/updates
- ✅ Pre-deployment validation

## Writing New Tests

### Guidelines
1. **Descriptive Names**: Test names should clearly describe what is being tested
2. **Arrange-Act-Assert**: Structure tests with clear setup, action, and verification
3. **Isolation**: Each test should be independent and not rely on other tests
4. **Coverage**: Aim for high code coverage but focus on critical paths
5. **Real Scenarios**: Test real-world usage patterns and edge cases

### Example Test Structure
```javascript
describe('DeviceService', () => {
  describe('categorizeDevices', () => {
    it('should correctly categorize light devices', () => {
      // Arrange
      const devices = fixtures.sampleDevices.mixed;
      
      // Act
      const result = deviceService.categorizeDevices(devices, 'lights');
      
      // Assert
      expect(result.category).toBe('Lights');
      expect(result.devices).toHaveLength(3);
      expect(result.devices[0].domain).toBe('light');
    });
  });
});
```

## Maintenance

- Review and update tests when adding new features
- Run full test suite before major releases
- Monitor test performance and optimize slow tests
- Keep mock data synchronized with real MCP responses
- Document any test-specific configuration or setup requirements