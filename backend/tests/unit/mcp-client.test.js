// Mock the HTTP modules before requiring mcp-client
jest.mock('http');
jest.mock('https');
jest.mock('axios');

const mcpClient = require('../../src/mcp-client');

describe('MCPClient Singleton', () => {
  beforeEach(() => {
    // Reset state for each test
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Reset client state
    mcpClient.connected = false;
    mcpClient.httpClient = null;
    mcpClient.mcpEndpoint = null;
    mcpClient.reconnectAttempts = 0;
    mcpClient.isReconnecting = false;
    mcpClient.lastActivity = Date.now();
    
    // Clear any existing timers
    if (mcpClient.healthCheckInterval) {
      clearInterval(mcpClient.healthCheckInterval);
      mcpClient.healthCheckInterval = null;
    }
    if (mcpClient.reconnectTimer) {
      clearTimeout(mcpClient.reconnectTimer);
      mcpClient.reconnectTimer = null;
    }
  });

  afterEach(() => {
    // Cleanup any timers
    mcpClient.cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Connection Status', () => {
    test('should return false for isConnected when not initialized', () => {
      expect(mcpClient.isConnected()).toBe(false);
    });

    test('should return correct connection status object', () => {
      const status = mcpClient.getConnectionStatus();
      
      expect(status).toEqual({
        connected: false,
        hasHttpClient: false,
        hasEndpoint: false,
        reconnectAttempts: 0,
        isReconnecting: false,
        lastActivity: expect.any(Number)
      });
    });

    test('should be connected when all components are present', () => {
      // Mock the required components
      mcpClient.connected = true;
      mcpClient.httpClient = { get: jest.fn() };
      mcpClient.mcpEndpoint = '/test-endpoint';
      
      expect(mcpClient.isConnected()).toBe(true);
    });
  });

  describe('Reconnection Logic', () => {
    test('should schedule reconnection with exponential backoff', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Call scheduleReconnect multiple times
      mcpClient.scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scheduling reconnection attempt 1/10 in 1000ms')
      );
      
      // Fast forward to trigger reconnection
      jest.advanceTimersByTime(1000);
      
      consoleSpy.mockRestore();
    });

    test('should stop reconnecting after max attempts', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Set to max attempts
      mcpClient.reconnectAttempts = 10;
      mcpClient.scheduleReconnect();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Max reconnection attempts reached. Will retry in 5 minutes.'
      );
      
      consoleSpy.mockRestore();
    });

    test('should reset reconnect attempts on successful connection', async () => {
      mcpClient.reconnectAttempts = 5;
      
      // Mock successful connection
      mcpClient.connectToMCPServer = jest.fn().mockResolvedValue();
      mcpClient.startHealthCheck = jest.fn();
      
      await mcpClient.initialize();
      
      expect(mcpClient.reconnectAttempts).toBe(0);
    });
  });

  describe('Health Monitoring', () => {
    test('should start health check interval', () => {
      mcpClient.startHealthCheck();
      
      expect(mcpClient.healthCheckInterval).toBeDefined();
    });

    test('should stop health check interval', () => {
      mcpClient.startHealthCheck();
      const interval = mcpClient.healthCheckInterval;
      
      mcpClient.stopHealthCheck();
      
      expect(mcpClient.healthCheckInterval).toBeNull();
    });

    test.skip('should trigger reconnection on stale connection', () => {
      // Skip this integration test for now
    });
  });

  describe('MCP Request Handling', () => {
    test('should reject requests when not connected', async () => {
      // Ensure client is not connected
      mcpClient.connected = false;
      
      await expect(mcpClient.sendMCPRequest('test')).rejects.toThrow(
        'MCP client not connected'
      );
    });

    test('should allow initialization requests when allowDuringInit is true', async () => {
      // Set up partial connection (httpClient and endpoint but not connected)
      mcpClient.connected = false;
      mcpClient.httpClient = { post: jest.fn().mockResolvedValue({ data: {} }) };
      mcpClient.mcpEndpoint = '/test-endpoint';
      mcpClient.pendingRequests = new Map();
      
      // Mock the axios post call
      const axios = require('axios');
      axios.create = jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: { result: 'success' } })
      });
      
      // This should not throw because allowDuringInit is true
      const promise = mcpClient.sendMCPRequest('initialize', {}, true);
      
      // Simulate successful response by resolving pending request
      const requestId = mcpClient.requestId - 1;
      if (mcpClient.pendingRequests.has(requestId)) {
        mcpClient.pendingRequests.get(requestId).resolve({ result: 'success' });
      }
      
      await expect(promise).resolves.toBeDefined();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup all resources', () => {
      // Set up some resources
      mcpClient.startHealthCheck();
      mcpClient.reconnectTimer = setTimeout(() => {}, 1000);
      const mockDestroy = jest.fn();
      mcpClient.connectionRequest = { destroy: mockDestroy };
      
      mcpClient.cleanup();
      
      expect(mcpClient.healthCheckInterval).toBeNull();
      expect(mcpClient.reconnectTimer).toBeNull();
      expect(mockDestroy).toHaveBeenCalled();
    });
  });
});