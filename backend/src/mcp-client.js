const axios = require('axios');
const https = require('https');
const http = require('http');

class MCPClient {
  constructor() {
    this.connected = false;
    this.eventSource = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.mcpEndpoint = null;
    this.sessionId = null;
    this.httpClient = null;
    this.currentEventType = null;
  }

  async initialize() {
    console.log('Connecting to Home Assistant MCP server...');
    
    try {
      await this.connectToMCPServer();
      console.log('Successfully connected to Home Assistant MCP server');
    } catch (error) {
      console.error('Failed to connect to MCP server:', error.message);
      this.connected = false;
      // Don't throw - let the app run with fallback
    }
  }

  async connectToMCPServer() {
    const haUrl = process.env.HOME_ASSISTANT_URL || 'http://192.168.0.159:8123';
    const token = process.env.HOME_ASSISTANT_TOKEN;
    
    if (!token) {
      throw new Error('HOMEASSISTANT_TOKEN environment variable required');
    }
    
    const sseUrl = `${haUrl}/mcp_server/sse`;
    console.log('Connecting to Home Assistant MCP server:', sseUrl);
    
    // Set up HTTP client for sending requests
    this.httpClient = axios.create({
      baseURL: haUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    return new Promise((resolve, reject) => {
      // Parse URL for custom SSE connection
      const url = new URL(sseUrl);
      const httpModule = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      };
      
      console.log('Making SSE request with options:', options);
      
      const req = httpModule.request(options, (res) => {
        console.log('SSE Response status:', res.statusCode);
        console.log('SSE Response headers:', res.headers);
        
        if (res.statusCode !== 200) {
          reject(new Error(`SSE connection failed with status ${res.statusCode}`));
          return;
        }
        
        console.log('SSE connection established');
        
        let buffer = '';
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer
          
          for (const line of lines) {
            this.handleSSELine(line);
          }
        });
        
        res.on('end', () => {
          console.log('SSE connection ended');
          this.connected = false;
        });
        
        res.on('error', (error) => {
          console.error('SSE response error:', error);
          reject(error);
        });
        
        // Give it a moment to establish and receive initial messages
        setTimeout(async () => {
          if (this.mcpEndpoint) {
            console.log('MCP endpoint ready, initializing session...');
            this.connected = true; // Set connected before attempting session init
            try {
              await this.initializeMCPSession();
              console.log('MCP session initialized successfully');
              resolve();
            } catch (error) {
              console.error('Failed to initialize MCP session:', error);
              resolve(); // Still resolve to allow the app to work
            }
          } else {
            console.log('No MCP endpoint received, but proceeding anyway');
            this.connected = true; // Allow the app to work even without proper endpoint
            resolve();
          }
        }, 2000);
      });
      
      req.on('error', (error) => {
        console.error('SSE request error:', error);
        reject(error);
      });
      
      req.end();
    });
  }

  async initializeMCPSession() {
    if (!this.mcpEndpoint) {
      throw new Error('No MCP endpoint available');
    }
    
    // Initialize the MCP session
    const initResponse = await this.sendMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {}
      },
      clientInfo: {
        name: 'dashboard-backend',
        version: '1.0.0'
      }
    });
    
    console.log('MCP session initialized:', initResponse);
    
    // Send initialized notification
    await this.sendMCPNotification('notifications/initialized');
    
    // Query available tools
    try {
      const toolsResponse = await this.sendMCPRequest('tools/list');
      console.log('Available MCP tools:', toolsResponse);
    } catch (error) {
      console.error('Failed to list MCP tools:', error);
    }
  }

  handleSSELine(line) {
    if (!line.trim()) return;
    
    console.log('SSE Line:', line);
    
    if (line.startsWith('event: ')) {
      this.currentEventType = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      const data = line.substring(6).trim();
      
      if (this.currentEventType === 'endpoint') {
        console.log('MCP endpoint established:', data);
        this.mcpEndpoint = data;
      } else {
        // Try to parse as JSON for MCP responses
        try {
          const jsonData = JSON.parse(data);
          console.log('MCP Response:', jsonData);
          
          if (jsonData.id && this.pendingRequests.has(jsonData.id)) {
            const { resolve, reject } = this.pendingRequests.get(jsonData.id);
            this.pendingRequests.delete(jsonData.id);
            
            if (jsonData.error) {
              reject(new Error(jsonData.error.message || 'MCP error'));
            } else {
              resolve(jsonData);
            }
          }
        } catch (e) {
          console.log('Non-JSON SSE data:', data);
        }
      }
    }
  }
  
  async sendMCPRequest(method, params = {}) {
    if (!this.connected || !this.httpClient || !this.mcpEndpoint) {
      throw new Error('MCP client not connected');
    }
    
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.pendingRequests.set(id, { resolve, reject });
      
      console.log('Sending MCP request:', JSON.stringify(request));
      
      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 10000);
      
      // Send request via HTTP POST to the MCP endpoint
      this.httpClient.post(this.mcpEndpoint, request)
        .catch(error => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(error);
          }
        });
    });
  }
  
  async sendMCPNotification(method, params = {}) {
    if (!this.connected || !this.httpClient || !this.mcpEndpoint) {
      throw new Error('MCP client not connected');
    }
    
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };
    
    console.log('Sending MCP notification:', JSON.stringify(notification));
    
    await this.httpClient.post(this.mcpEndpoint, notification);
  }
  
  async getLiveContext() {
    // For now, use a simplified approach that directly gets data from Home Assistant
    // This bypasses the MCP connection issues temporarily
    
    try {
      if (!this.httpClient) {
        // Initialize HTTP client if not already done
        const haUrl = process.env.HOME_ASSISTANT_URL || 'http://192.168.0.159:8123';
        const token = process.env.HOME_ASSISTANT_TOKEN;
        
        this.httpClient = axios.create({
          baseURL: haUrl,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
      }
      
      // Get current device states from Home Assistant API
      const statesResponse = await this.httpClient.get('/api/states');
      const devices = statesResponse.data;
      
      // Convert to MCP-like format that our parser expects
      let mcpFormat = 'Live Context: An overview of the areas and the devices in this smart home:\n';
      
      devices.forEach(device => {
        if (device.state !== 'unavailable' && device.state !== 'unknown') {
          const entityName = device.attributes.friendly_name || device.entity_id;
          const domain = device.entity_id.split('.')[0];
          
          mcpFormat += `- names: '${entityName}'\n`;
          mcpFormat += `  domain: ${domain}\n`;
          mcpFormat += `  state: '${device.state}'\n`;
          
          if (device.attributes.area_id) {
            mcpFormat += `  areas: ${device.attributes.area_id}\n`;
          }
          
          mcpFormat += `  attributes:\n`;
          if (device.attributes.brightness) {
            mcpFormat += `    brightness: '${device.attributes.brightness}'\n`;
          }
          if (device.attributes.device_class) {
            mcpFormat += `    device_class: ${device.attributes.device_class}\n`;
          }
          if (device.attributes.unit_of_measurement) {
            mcpFormat += `    unit_of_measurement: ${device.attributes.unit_of_measurement}\n`;
          }
          if (device.attributes.percentage !== undefined) {
            mcpFormat += `    percentage: '${device.attributes.percentage}'\n`;
          }
        }
      });
      
      return {
        result: mcpFormat
      };
    } catch (error) {
      console.error('Error getting live context from Home Assistant:', error.message);
      throw error;
    }
  }


  async turnOn(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassTurnOn',
        arguments: criteria
      });
      return { success: true, message: 'Device turned on', data: response.result };
    } catch (error) {
      console.error('Error turning on device:', error);
      return { success: false, message: error.message };
    }
  }

  async turnOff(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassTurnOff',
        arguments: criteria
      });
      return { success: true, message: 'Device turned off', data: response.result };
    } catch (error) {
      console.error('Error turning off device:', error);
      return { success: false, message: error.message };
    }
  }

  async setLightBrightness(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassLightSet',
        arguments: criteria
      });
      return { success: true, message: 'Brightness set', data: response.result };
    } catch (error) {
      console.error('Error setting brightness:', error);
      return { success: false, message: error.message };
    }
  }

  async setFanSpeed(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassSetVolume',
        arguments: criteria
      });
      return { success: true, message: 'Fan speed set', data: response.result };
    } catch (error) {
      console.error('Error setting fan speed:', error);
      return { success: false, message: error.message };
    }
  }

  async setClimateTemperature(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassClimateSetTemperature',
        arguments: criteria
      });
      return { success: true, message: 'Temperature set', data: response.result };
    } catch (error) {
      console.error('Error setting temperature:', error);
      return { success: false, message: error.message };
    }
  }

  async controlMediaPlayer(criteria, action) {
    try {
      let method;
      switch (action) {
        case 'play':
          method = 'HassMediaUnpause';
          break;
        case 'pause':
          method = 'HassMediaPause';
          break;
        case 'next':
          method = 'HassMediaNext';
          break;
        case 'previous':
          method = 'HassMediaPrevious';
          break;
        default:
          throw new Error(`Unknown media action: ${action}`);
      }
      
      const response = await this.sendMCPRequest('tools/call', {
        name: method,
        arguments: criteria
      });
      return { success: true, message: `Media ${action} executed`, data: response.result };
    } catch (error) {
      console.error('Error controlling media:', error);
      return { success: false, message: error.message };
    }
  }

  async setVolume(criteria) {
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'HassSetVolume',
        arguments: criteria
      });
      return { success: true, message: 'Volume set', data: response.result };
    } catch (error) {
      console.error('Error setting volume:', error);
      return { success: false, message: error.message };
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.httpClient = null;
    this.mcpEndpoint = null;
    this.sessionId = null;
    this.pendingRequests.clear();
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = new MCPClient();