const DeviceService = require('../../src/device-service');
const fixtures = require('../fixtures/sample-devices');

// Mock the MCP client
jest.mock('../../src/mcp-client', () => ({
  getLiveContext: jest.fn(),
  turnOn: jest.fn(),
  turnOff: jest.fn(),
  setLightBrightness: jest.fn(),
  isConnected: jest.fn(() => true)
}));

// Mock the device cache to avoid real MCP calls and timers
jest.mock('../../src/device-cache', () => ({
  getCachedDevices: jest.fn(),
  getDeviceCount: jest.fn(),
  getLastUpdateTime: jest.fn(),
  getTimeSinceLastUpdate: jest.fn(),
  formatMountainTime: jest.fn(),
  manualRefresh: jest.fn(),
  getPerformanceStats: jest.fn()
}));

const deviceCache = require('../../src/device-cache');

describe('DeviceService', () => {
  beforeEach(() => {
    // Reset any cached state
    DeviceService.lastKnownState = null;
    jest.clearAllMocks();
    
    // Setup default mock responses for device cache
    deviceCache.getCachedDevices.mockReturnValue(fixtures.parsedDevices);
    deviceCache.getDeviceCount.mockReturnValue(5);
    deviceCache.getLastUpdateTime.mockReturnValue(Date.now());
    deviceCache.getTimeSinceLastUpdate.mockReturnValue(1000);
    deviceCache.formatMountainTime.mockReturnValue('10:30:45 PM MST');
    deviceCache.getPerformanceStats.mockReturnValue({
      totalPolls: 10,
      avgResponseTime: 150,
      errorCount: 0,
      filteredEntityCount: 100,
      totalEntityCount: 500
    });
  });

  // Remove parseLiveContext tests since method moved to DeviceCache
  describe('getDashboardState', () => {
    it('should return dashboard state with metadata', async () => {
      const result = await DeviceService.getDashboardState();
      
      expect(result).toHaveProperty('doors');
      expect(result).toHaveProperty('lights');  
      expect(result).toHaveProperty('climate');
      expect(result).toHaveProperty('security');
      expect(result).toHaveProperty('media');
      expect(result).toHaveProperty('metadata');
      
      expect(result.metadata.deviceCount).toBe(5);
      expect(result.metadata.performanceStats).toBeDefined();
    });

    it('should handle cache errors gracefully', async () => {
      deviceCache.getCachedDevices.mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await DeviceService.getDashboardState();
      
      // Should return default state on error
      expect(result).toHaveProperty('doors');
      expect(result.doors.summary).toBe('Unable to connect to Home Assistant');
    });
  });

  describe('manualDeviceRefresh', () => {
    it('should trigger manual refresh and return updated state', async () => {
      const mockRefreshResult = {
        deviceCount: 10,
        lastUpdate: Date.now(),
        performanceStats: {
          totalPolls: 5,
          avgResponseTime: 120
        }
      };
      
      deviceCache.manualRefresh.mockResolvedValue(mockRefreshResult);
      
      const result = await DeviceService.manualDeviceRefresh();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('10 devices');
      expect(result.dashboardState).toHaveProperty('doors');
      expect(deviceCache.manualRefresh).toHaveBeenCalledTimes(1);
    });

    it('should handle refresh errors', async () => {
      deviceCache.manualRefresh.mockRejectedValue(new Error('Refresh failed'));
      
      const result = await DeviceService.manualDeviceRefresh();
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Refresh failed');
    });
  });

  describe('categorizeDevices', () => {
    const testDevices = fixtures.parsedDevices;

    it('should categorize light devices correctly', () => {
      const result = DeviceService.categorizeDevices(testDevices, 'lights');
      
      expect(result.category).toBe('Lights');
      expect(result.devices).toHaveLength(2);
      expect(result.devices.every(d => d.domain === 'light')).toBe(true);
      expect(result.summary).toBe('1 light(s) currently on');
      expect(result.allOk).toBe(false); // Because lights are on
    });

    it('should categorize door devices correctly', () => {
      const result = DeviceService.categorizeDevices(testDevices, 'doors');
      
      expect(result.category).toBe('Doors');
      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].domain).toBe('binary_sensor');
      expect(result.summary).toBe('All doors closed and locked');
      expect(result.allOk).toBe(true); // Door is closed
    });

    it('should categorize climate devices correctly', () => {
      const result = DeviceService.categorizeDevices(testDevices, 'climate');
      
      expect(result.category).toBe('Climate');
      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].domain).toBe('climate');
      expect(result.allOk).toBe(true); // Climate doesn't have "all OK" state
    });

    it('should categorize media devices correctly', () => {
      const result = DeviceService.categorizeDevices(testDevices, 'media');
      
      expect(result.category).toBe('Media');
      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].domain).toBe('media_player');
      expect(result.summary).toBe('1 media player(s) active');
      expect(result.allOk).toBe(false); // Media is playing
    });

    it('should handle empty device list', () => {
      const result = DeviceService.categorizeDevices([], 'lights');
      
      expect(result.category).toBe('Lights');
      expect(result.devices).toHaveLength(0);
      expect(result.summary).toBe('All lights are off');
      expect(result.allOk).toBe(true);
    });
  });

  describe('calculateAverageTemperature', () => {
    it('should calculate average temperature correctly', () => {
      const tempDevices = fixtures.temperatureDevices;
      const result = DeviceService.calculateAverageTemperature(tempDevices);
      
      // (72 + 70 + 68) / 3 = 70
      expect(result).toBe(70);
    });

    it('should return null for no temperature devices', () => {
      const result = DeviceService.calculateAverageTemperature([]);
      expect(result).toBeNull();
    });

    it('should handle invalid temperature values', () => {
      const invalidTempDevices = [
        {
          domain: 'sensor',
          state: 'invalid',
          attributes: { device_class: 'temperature' }
        }
      ];
      
      const result = DeviceService.calculateAverageTemperature(invalidTempDevices);
      expect(result).toBeNull();
    });
  });

  describe('findDeviceById', () => {
    beforeEach(() => {
      // Set up mock state
      DeviceService.lastKnownState = {
        lights: { devices: [fixtures.parsedDevices[0]] },
        doors: { devices: [fixtures.parsedDevices[2]] },
        climate: { devices: [fixtures.parsedDevices[3]] },
        security: { devices: [] },
        media: { devices: [fixtures.parsedDevices[4]] }
      };
    });

    it('should find device by exact ID match', async () => {
      const result = await DeviceService.findDeviceById('Kitchen Light');
      expect(result).toEqual(fixtures.parsedDevices[0]);
    });

    it('should find device by name match', async () => {
      const result = await DeviceService.findDeviceById('Front Door');
      expect(result).toEqual(fixtures.parsedDevices[2]);
    });

    it('should return undefined for non-existent device', async () => {
      const result = await DeviceService.findDeviceById('Non Existent Device');
      expect(result).toBeUndefined();
    });
  });

  describe('getDefaultDashboardState', () => {
    it('should return proper default state structure', () => {
      const result = DeviceService.getDefaultDashboardState();
      
      expect(result).toHaveProperty('doors');
      expect(result).toHaveProperty('lights');
      expect(result).toHaveProperty('climate');
      expect(result).toHaveProperty('security');
      expect(result).toHaveProperty('media');
      
      // All categories should indicate connection failure
      Object.values(result).forEach(category => {
        expect(category.summary).toContain('Unable to connect');
        expect(category.allOk).toBe(false);
        expect(category.devices).toEqual([]);
      });
    });
  });
});