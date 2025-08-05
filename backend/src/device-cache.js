const mcpClient = require('./mcp-client');

class DeviceCache {
  constructor(options = {}) {
    // Unified device cache with state tracking
    this.deviceCache = new Map(); // Full device data with state history
    this.lastUpdate = null;
    this.updateInterval = 500; // 500ms uniform polling
    
    // Performance tracking
    this.performanceStats = {
      totalPolls: 0,
      avgResponseTime: 0,
      errorCount: 0,
      lastErrorTime: null,
      filteredEntityCount: 0,
      totalEntityCount: 0
    };
    
    // Dashboard-relevant entity filters
    this.dashboardEntityTypes = {
      // Security entities
      security: {
        domains: ['binary_sensor', 'lock'],
        deviceClasses: ['motion', 'opening', 'door', 'window', 'lock', 'smoke', 'gas', 'safety', 'problem']
      },
      // Lighting entities
      lights: {
        domains: ['light', 'switch'],
        exclude: ['schedule', 'automation', 'script'] // exclude non-physical switches
      },
      // Climate entities
      climate: {
        domains: ['climate', 'fan', 'sensor'],
        deviceClasses: ['temperature', 'humidity'],
        sensorTypes: ['temperature', 'humidity']
      },
      // Media entities
      media: {
        domains: ['media_player'],
        deviceClasses: ['tv', 'speaker', 'receiver']
      },
      // Door/cover entities
      doors: {
        domains: ['cover', 'lock'],
        deviceClasses: ['garage', 'door', 'gate']
      }
    };
    
    // Timezone configuration
    this.timezone = 'America/Denver'; // MT timezone
    
    // Test mode flag
    this.testMode = options.testMode || process.env.NODE_ENV === 'test';
    
    // Don't start automatic refresh cycles immediately - wait for MCP to be ready
    this.refreshCyclesStarted = false;
  }

  startRefreshCycles() {
    if (this.refreshCyclesStarted || this.testMode) {
      console.log('[CACHE] Refresh cycles already started or in test mode');
      return;
    }
    
    console.log('[CACHE] Starting unified 500ms polling cycle...');
    this.refreshCyclesStarted = true;
    
    // Do an immediate refresh to populate the cache
    this.refreshDeviceCache().catch(err => 
      console.error('[CACHE] Initial device cache refresh failed:', err)
    );
    
    // Unified 500ms polling
    setInterval(async () => {
      await this.refreshDeviceCache();
    }, this.updateInterval);

    // Performance logging every 30 seconds
    setInterval(() => {
      this.logPerformanceStats();
    }, 30000);
  }

  async refreshDeviceCache() {
    const startTime = Date.now();
    const pollId = this.performanceStats.totalPolls + 1;
    
    try {
      console.log(`[CACHE-POLL-${pollId}] Starting 500ms cache refresh...`);
      
      // Get live context from MCP server
      const liveContext = await mcpClient.getLiveContext();
      const mcpDuration = Date.now() - startTime;
      
      if (!liveContext || !liveContext.result) {
        throw new Error('No live context received from MCP');
      }
      
      console.log(`[CACHE-POLL-${pollId}] MCP response received in ${mcpDuration}ms`);
      
      // Parse and filter entities
      const parseStart = Date.now();
      const allEntities = this.parseLiveContext(liveContext);
      const filteredEntities = this.filterDashboardRelevantEntities(allEntities);
      const parseDuration = Date.now() - parseStart;
      
      console.log(`[CACHE-POLL-${pollId}] Parsed ${allEntities.length} total entities, filtered to ${filteredEntities.length} relevant entities in ${parseDuration}ms`);
      
      // Update cache with change detection
      let changedEntities = 0;
      const updateStart = Date.now();
      
      filteredEntities.forEach(entity => {
        const existing = this.deviceCache.get(entity.id);
        const now = Date.now();
        
        if (!existing || existing.state !== entity.state) {
          // Entity changed or is new
          this.deviceCache.set(entity.id, {
            ...entity,
            lastChanged: existing && existing.state !== entity.state ? now : (existing?.lastChanged || now),
            lastSeen: now
          });
          changedEntities++;
        } else {
          // Entity unchanged, just update lastSeen
          existing.lastSeen = now;
        }
      });
      
      const updateDuration = Date.now() - updateStart;
      const totalDuration = Date.now() - startTime;
      
      // Update performance stats
      this.performanceStats.totalPolls++;
      this.performanceStats.avgResponseTime = 
        (this.performanceStats.avgResponseTime * (this.performanceStats.totalPolls - 1) + totalDuration) / 
        this.performanceStats.totalPolls;
      this.performanceStats.filteredEntityCount = filteredEntities.length;
      this.performanceStats.totalEntityCount = allEntities.length;
      
      this.lastUpdate = Date.now();
      
      console.log(`[CACHE-POLL-${pollId}] Cache updated: ${changedEntities} changed entities, total duration: ${totalDuration}ms (MCP: ${mcpDuration}ms, Parse: ${parseDuration}ms, Update: ${updateDuration}ms)`);
      
      return this.deviceCache;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.performanceStats.errorCount++;
      this.performanceStats.lastErrorTime = Date.now();
      
      console.error(`[CACHE-POLL-${pollId}] Cache refresh failed after ${duration}ms:`, error.message);
      return this.deviceCache;
    }
  }

  filterDashboardRelevantEntities(entities) {
    return entities.filter(entity => {
      const domain = entity.domain;
      const deviceClass = entity.attributes?.device_class;
      const name = entity.name?.toLowerCase() || '';
      
      // Security entities
      if (this.dashboardEntityTypes.security.domains.includes(domain)) {
        if (domain === 'binary_sensor' && this.dashboardEntityTypes.security.deviceClasses.includes(deviceClass)) {
          return true;
        }
        if (domain === 'lock') {
          return true;
        }
      }
      
      // Lighting entities
      if (this.dashboardEntityTypes.lights.domains.includes(domain)) {
        // Exclude automation/schedule switches
        const isExcluded = this.dashboardEntityTypes.lights.exclude.some(exclude => 
          name.includes(exclude)
        );
        return !isExcluded;
      }
      
      // Climate entities
      if (this.dashboardEntityTypes.climate.domains.includes(domain)) {
        if (domain === 'climate' || domain === 'fan') {
          return true;
        }
        if (domain === 'sensor' && this.dashboardEntityTypes.climate.deviceClasses.includes(deviceClass)) {
          return true;
        }
      }
      
      // Media entities
      if (this.dashboardEntityTypes.media.domains.includes(domain)) {
        return true;
      }
      
      // Door/cover entities
      if (this.dashboardEntityTypes.doors.domains.includes(domain)) {
        if (domain === 'cover' && this.dashboardEntityTypes.doors.deviceClasses.includes(deviceClass)) {
          return true;
        }
        if (domain === 'lock') {
          return true; // Already handled above but keeping for clarity
        }
      }
      
      return false;
    });
  }

  logPerformanceStats() {
    const stats = this.performanceStats;
    const errorRate = stats.totalPolls > 0 ? (stats.errorCount / stats.totalPolls * 100).toFixed(2) : 0;
    const lastErrorAgo = stats.lastErrorTime ? Math.floor((Date.now() - stats.lastErrorTime) / 1000) : 'never';
    
    console.log(`[CACHE-PERF] Performance Summary:`);
    console.log(`  Total Polls: ${stats.totalPolls}`);
    console.log(`  Avg Response Time: ${Math.round(stats.avgResponseTime)}ms`);
    console.log(`  Error Rate: ${errorRate}% (${stats.errorCount} errors)`);
    console.log(`  Last Error: ${lastErrorAgo === 'never' ? 'never' : lastErrorAgo + 's ago'}`);
    console.log(`  Entity Filtering: ${stats.totalEntityCount} → ${stats.filteredEntityCount} (${Math.round(stats.filteredEntityCount/stats.totalEntityCount*100)}% relevant)`);
    console.log(`  Cache Size: ${this.deviceCache.size} entities`);
  }

  async manualRefresh() {
    console.log('[CACHE] Manual device refresh triggered');
    await this.refreshDeviceCache();
    return {
      deviceCount: this.deviceCache.size,
      lastUpdate: this.lastUpdate,
      performanceStats: this.performanceStats
    };
  }

  getCachedDevices() {
    return Array.from(this.deviceCache.values());
  }

  getDeviceCount() {
    return this.deviceCache.size;
  }

  getLastUpdateTime() {
    return this.lastUpdate;
  }

  getTimeSinceLastUpdate() {
    if (!this.lastUpdate) return null;
    return Date.now() - this.lastUpdate;
  }

  getPerformanceStats() {
    return { ...this.performanceStats };
  }

  formatMountainTime(timestamp) {
    if (!timestamp) return 'Never';
    
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(new Date(timestamp));
  }

  // Parse MCP live context (moved from device-service.js)
  parseLiveContext(contextData) {
    const devices = [];
    
    if (!contextData || !contextData.result) {
      console.warn('No context data received from MCP');
      return devices;
    }

    // Handle new MCP response structure: result.content[0].text
    let contextText;
    if (contextData.result.content && contextData.result.content[0] && contextData.result.content[0].text) {
      // New MCP structure: result.content[0].text contains JSON string
      const textContent = contextData.result.content[0].text;
      try {
        const parsed = JSON.parse(textContent);
        if (parsed.success && parsed.result) {
          contextText = parsed.result;
        } else {
          console.error('MCP response not successful:', parsed);
          return devices;
        }
      } catch (e) {
        // Maybe it's just plain text
        contextText = textContent;
      }
    } else if (typeof contextData.result === 'string') {
      // Old format fallback
      contextText = contextData.result;
    } else {
      console.error('Unexpected MCP response structure:', JSON.stringify(contextData.result, null, 2));
      return devices;
    }

    console.log('DeviceCache parsing context, length:', contextText.length);
    console.log('First 500 chars:', contextText.substring(0, 500));
    const lines = contextText.split('\n');
    let currentDevice = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('Live Context:')) continue;
      
      if (line.startsWith('- names:')) {
        if (currentDevice) {
          devices.push(currentDevice);
        }
        
        const nameMatch = line.match(/- names:\s*'?([^']+)'?/);
        if (nameMatch) {
          currentDevice = {
            id: nameMatch[1].trim(),
            name: nameMatch[1].trim(),
            domain: '',
            state: '',
            area: '',
            attributes: {}
          };
        }
      } else if (currentDevice) {
        if (trimmedLine.startsWith('domain:')) {
          currentDevice.domain = trimmedLine.replace('domain:', '').trim();
        } else if (trimmedLine.startsWith('state:')) {
          currentDevice.state = trimmedLine.replace('state:', '').trim().replace(/'/g, '');
        } else if (trimmedLine.startsWith('areas:')) {
          currentDevice.area = trimmedLine.replace('areas:', '').trim();
        } else if (trimmedLine.includes(':') && !trimmedLine.startsWith('-') && trimmedLine.indexOf(':') > 0) {
          const colonIndex = trimmedLine.indexOf(':');
          const key = trimmedLine.substring(0, colonIndex).trim();
          const value = trimmedLine.substring(colonIndex + 1).trim();
          if (key && value) {
            currentDevice.attributes[key] = value.replace(/'/g, '');
          }
        }
      }
    }
    
    if (currentDevice) {
      devices.push(currentDevice);
    }
    
    return devices.filter(device => device.domain && device.state !== 'unavailable');
  }
}

// Export both the class and a singleton instance
module.exports = new DeviceCache();
module.exports.DeviceCache = DeviceCache;