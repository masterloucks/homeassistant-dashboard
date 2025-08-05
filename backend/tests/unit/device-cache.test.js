// Import the DeviceCache class directly for testing
const mcpClient = require('../../src/mcp-client');

// Mock the MCP client to avoid real network calls
jest.mock('../../src/mcp-client', () => ({
  getLiveContext: jest.fn()
}));

// Import DeviceCache class for testing
const { DeviceCache } = require('../../src/device-cache');
const fixtures = require('../fixtures/sample-devices');

describe('DeviceCache', () => {
  let deviceCache;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a new instance in test mode for each test
    deviceCache = new DeviceCache({ testMode: true });
  });

  describe('parseLiveContext', () => {
    it('should parse MCP live context response correctly', () => {
      const result = deviceCache.parseLiveContext(fixtures.mockMCPResponse);
      
      expect(result).toHaveLength(5);
      expect(result[0]).toEqual(fixtures.parsedDevices[0]);
      expect(result[1]).toEqual(fixtures.parsedDevices[1]);
    });

    it('should handle empty or invalid context data', () => {
      const result = deviceCache.parseLiveContext(null);
      expect(result).toEqual([]);

      const result2 = deviceCache.parseLiveContext({ result: '' });
      expect(result2).toEqual([]);
    });

    it('should filter out unavailable devices', () => {
      const contextWithUnavailable = {
        result: `Live Context: Test
- names: Available Light
  domain: light
  state: 'on'
- names: Unavailable Light
  domain: light
  state: 'unavailable'`
      };

      const result = deviceCache.parseLiveContext(contextWithUnavailable);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Available Light');
    });
  });

  describe('manual refresh', () => {
    it('should refresh device registry manually', async () => {
      mcpClient.getLiveContext.mockResolvedValue(fixtures.mockMCPResponse);

      const result = await deviceCache.manualRefresh();

      expect(result.deviceCount).toBe(5);
      expect(result.lastUpdate).toBeTruthy();
      expect(result.performanceStats).toBeDefined();
      expect(deviceCache.getDeviceCount()).toBe(5);
    });

    it('should handle refresh errors gracefully', async () => {
      mcpClient.getLiveContext.mockRejectedValue(new Error('MCP connection failed'));

      const result = await deviceCache.manualRefresh();

      expect(result.deviceCount).toBe(0);
      expect(deviceCache.getDeviceCount()).toBe(0);
    });
  });

  describe('cached devices', () => {
    beforeEach(async () => {
      mcpClient.getLiveContext.mockResolvedValue(fixtures.mockMCPResponse);
      await deviceCache.manualRefresh();
    });

    it('should return cached devices with merged state info', () => {
      const devices = deviceCache.getCachedDevices();
      
      expect(devices).toHaveLength(5);
      expect(devices[0].name).toBe('Kitchen Light');
      expect(devices[0].state).toBe('on');
      expect(devices[0].domain).toBe('light');
    });

    it('should track device count correctly', () => {
      expect(deviceCache.getDeviceCount()).toBe(5);
    });

    it('should track last update time', () => {
      const lastUpdate = deviceCache.getLastUpdateTime();
      expect(lastUpdate).toBeTruthy();
      
      const timeSince = deviceCache.getTimeSinceLastUpdate();
      expect(timeSince).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timezone formatting', () => {
    it('should format timestamps in Mountain Time', () => {
      const timestamp = Date.now();
      const formatted = deviceCache.formatMountainTime(timestamp);
      
      expect(formatted).toMatch(/\d{1,2}:\d{2}:\d{2} (AM|PM) M(D|S)T/);
    });

    it('should handle null timestamps', () => {
      const formatted = deviceCache.formatMountainTime(null);
      expect(formatted).toBe('Never');
    });
  });

  // NOTE: shouldRefreshDeviceRegistry method removed - using uniform 500ms polling now
  // These tests are disabled since the multi-tier polling system was removed
  /*
  describe('should refresh flags', () => {
    it('should indicate refresh needed when no previous discovery', () => {
      expect(deviceCache.shouldRefreshDeviceRegistry()).toBe(true);
    });

    it('should indicate refresh not needed when recent discovery', () => {
      deviceCache.lastDiscovery = Date.now();
      expect(deviceCache.shouldRefreshDeviceRegistry()).toBe(false);
    });

    it('should indicate refresh needed when discovery is old', () => {
      deviceCache.lastDiscovery = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      expect(deviceCache.shouldRefreshDeviceRegistry()).toBe(true);
    });
  });
  */
});