const mcpClient = require('./mcp-client');
const deviceCache = require('./device-cache');

class DeviceService {
  constructor() {
    this.lastKnownState = null;
  }

  async getDashboardState() {
    try {
      // Check MCP connection status
      if (!mcpClient.isConnected()) {
        console.log('DeviceService: MCP client not connected, using cached data');
        console.log('DeviceService: Connection status:', mcpClient.getConnectionStatus());
      } else {
        // TEMP: Test if MCP is working by calling directly
        console.log('DeviceService: Testing direct MCP call...');
        const directContext = await mcpClient.getLiveContext();
        console.log('DeviceService: Direct MCP response:', directContext ? 'received' : 'null');
        if (directContext && directContext.result) {
          console.log('DeviceService: Direct context length:', directContext.result.length);
        }
      }
      
      // Get devices from cache (auto-refreshes as needed)
      const devices = deviceCache.getCachedDevices();
      
      const dashboardState = {
        doors: this.categorizeDevices(devices, 'doors'),
        lights: this.categorizeDevices(devices, 'lights'),
        climate: this.categorizeDevices(devices, 'climate'),
        security: this.categorizeDevices(devices, 'security'),
        media: this.categorizeDevices(devices, 'media'),
        
        // Add metadata for dashboard footer
        metadata: {
          deviceCount: deviceCache.getDeviceCount(),
          lastUpdate: deviceCache.getLastUpdateTime(),
          timeSinceLastUpdate: deviceCache.getTimeSinceLastUpdate(),
          performanceStats: deviceCache.getPerformanceStats()
        }
      };

      this.lastKnownState = dashboardState;
      return dashboardState;
    } catch (error) {
      console.error('Error getting dashboard state:', error);
      // Return last known state if available, otherwise default state
      return this.lastKnownState || this.getDefaultDashboardState();
    }
  }

  async manualDeviceRefresh() {
    try {
      console.log('Manual device refresh requested');
      const result = await deviceCache.manualRefresh();
      
      // Return updated dashboard state
      const dashboardState = await this.getDashboardState();
      return {
        success: true,
        message: `Refreshed ${result.deviceCount} devices`,
        dashboardState,
        refreshInfo: result
      };
    } catch (error) {
      console.error('Error in manual device refresh:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // parseLiveContext method moved to DeviceCache class

  categorizeDevices(devices, category) {
    let filteredDevices = [];
    let summary = '';
    let allOk = true;
    
    switch (category) {
      case 'doors':
        filteredDevices = devices.filter(device => 
          (device.domain === 'cover' && device.attributes.device_class === 'garage') ||
          (device.domain === 'binary_sensor' && device.attributes.device_class === 'opening') ||
          (device.domain === 'lock')
        );
        
        const openDoors = filteredDevices.filter(device => 
          device.state === 'open' || device.state === 'on' || device.state === 'unlocked'
        );
        
        if (openDoors.length === 0) {
          summary = 'All doors closed and locked';
          allOk = true;
        } else {
          summary = `${openDoors.length} door(s) need attention`;
          allOk = false;
        }
        break;
        
      case 'lights':
        filteredDevices = devices.filter(device => 
          device.domain === 'light' || 
          (device.domain === 'switch' && !device.name.toLowerCase().includes('schedule'))
        );
        
        const activeLights = filteredDevices.filter(device => device.state === 'on');
        
        if (activeLights.length === 0) {
          summary = 'All lights are off';
          allOk = true;
        } else {
          summary = `${activeLights.length} light(s) currently on`;
          allOk = false;
        }
        break;
        
      case 'climate':
        filteredDevices = devices.filter(device => 
          device.domain === 'climate' || 
          device.domain === 'fan' ||
          (device.domain === 'sensor' && (
            device.attributes.device_class === 'temperature' ||
            device.attributes.device_class === 'humidity'
          ))
        );
        
        // Climate is always shown for information
        const avgTemp = this.calculateAverageTemperature(filteredDevices);
        summary = avgTemp ? `Average temperature: ${avgTemp}°F` : 'Climate monitoring active';
        allOk = true; // Climate doesn't have an "all OK" state
        break;
        
      case 'security':
        filteredDevices = devices.filter(device => 
          (device.domain === 'binary_sensor' && device.attributes.device_class === 'motion') ||
          (device.domain === 'binary_sensor' && device.attributes.device_class === 'opening') ||
          device.domain === 'lock'
        );
        
        const securityIssues = filteredDevices.filter(device => 
          (device.domain === 'binary_sensor' && device.state === 'on') ||
          (device.domain === 'lock' && device.state === 'unlocked')
        );
        
        if (securityIssues.length === 0) {
          summary = 'All security sensors clear';
          allOk = true;
        } else {
          summary = `${securityIssues.length} security alert(s)`;
          allOk = false;
        }
        break;
        
      case 'media':
        filteredDevices = devices.filter(device => device.domain === 'media_player');
        
        const activeMedia = filteredDevices.filter(device => 
          device.state === 'playing' || device.state === 'paused' || device.state === 'on'
        );
        
        if (activeMedia.length === 0) {
          summary = 'No active media players';
          allOk = true;
        } else {
          summary = `${activeMedia.length} media player(s) active`;
          allOk = false;
        }
        break;
    }
    
    return {
      category: category.charAt(0).toUpperCase() + category.slice(1),
      summary,
      devices: filteredDevices,
      allOk
    };
  }

  calculateAverageTemperature(devices) {
    const tempDevices = devices.filter(device => 
      device.domain === 'sensor' && 
      device.attributes.device_class === 'temperature' &&
      !isNaN(parseFloat(device.state))
    );
    
    if (tempDevices.length === 0) return null;
    
    const total = tempDevices.reduce((sum, device) => sum + parseFloat(device.state), 0);
    return Math.round(total / tempDevices.length);
  }

  async toggleDevice(deviceId) {
    try {
      // Find device info to determine how to toggle it
      const device = await this.findDeviceById(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      if (device.state === 'on') {
        return await mcpClient.turnOff({ name: deviceId });
      } else {
        return await mcpClient.turnOn({ name: deviceId });
      }
    } catch (error) {
      console.error('Error toggling device:', error);
      throw error;
    }
  }

  async setBrightness(deviceId, brightness) {
    try {
      return await mcpClient.setLightBrightness({ 
        name: deviceId, 
        brightness: Math.round((brightness / 100) * 255) 
      });
    } catch (error) {
      console.error('Error setting brightness:', error);
      throw error;
    }
  }

  async setFanSpeed(deviceId, percentage) {
    try {
      return await mcpClient.setFanSpeed({ name: deviceId, percentage });
    } catch (error) {
      console.error('Error setting fan speed:', error);
      throw error;
    }
  }

  async setTemperature(deviceId, temperature) {
    try {
      return await mcpClient.setClimateTemperature({ name: deviceId, temperature });
    } catch (error) {
      console.error('Error setting temperature:', error);
      throw error;
    }
  }

  async controlMedia(deviceId, action) {
    try {
      return await mcpClient.controlMediaPlayer({ name: deviceId }, action);
    } catch (error) {
      console.error('Error controlling media:', error);
      throw error;
    }
  }

  async activateScene(sceneId) {
    try {
      return await mcpClient.turnOn({ name: sceneId });
    } catch (error) {
      console.error('Error activating scene:', error);
      throw error;
    }
  }

  async findDeviceById(deviceId) {
    if (!this.lastKnownState) {
      await this.getDashboardState();
    }
    
    const allDevices = [
      ...this.lastKnownState.doors.devices,
      ...this.lastKnownState.lights.devices,
      ...this.lastKnownState.climate.devices,
      ...this.lastKnownState.security.devices,
      ...this.lastKnownState.media.devices
    ];
    
    return allDevices.find(device => device.id === deviceId || device.name === deviceId);
  }

  getDefaultDashboardState() {
    return {
      doors: {
        category: 'Doors',
        summary: 'Unable to connect to Home Assistant',
        devices: [],
        allOk: false
      },
      lights: {
        category: 'Lights',
        summary: 'Unable to connect to Home Assistant',
        devices: [],
        allOk: false
      },
      climate: {
        category: 'Climate',
        summary: 'Unable to connect to Home Assistant',
        devices: [],
        allOk: false
      },
      security: {
        category: 'Security',
        summary: 'Unable to connect to Home Assistant',  
        devices: [],
        allOk: false
      },
      media: {
        category: 'Media',
        summary: 'Unable to connect to Home Assistant',
        devices: [],
        allOk: false
      }
    };
  }
}

module.exports = new DeviceService();