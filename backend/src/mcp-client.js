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
    
    // Reconnection properties
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.reconnectTimer = null;
    this.isReconnecting = false;
    
    // Connection monitoring
    this.lastActivity = Date.now();
    this.healthCheckInterval = null;
    this.connectionRequest = null;
  }

  async initialize() {
    console.log('Connecting to Home Assistant MCP server...');
    
    try {
      await this.connectToMCPServer();
      console.log('Successfully connected to Home Assistant MCP server');
      this.reconnectAttempts = 0; // Reset on successful connection
      this.startHealthCheck();
    } catch (error) {
      console.error('Failed to connect to MCP server:', error.message);
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached. Will retry in 5 minutes.');
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts = 0;
          this.scheduleReconnect();
        }, 300000); // 5 minutes
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.isReconnecting = false;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      try {
        await this.connectToMCPServer();
        console.log('Reconnection successful!');
        this.reconnectAttempts = 0;
        this.startHealthCheck();
      } catch (error) {
        console.error('Reconnection failed:', error.message);
        this.connected = false;
        this.scheduleReconnect();
      }
    }, delay);
  }

  startHealthCheck() {
    this.stopHealthCheck();
    
    this.healthCheckInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastActivity;
      
      // If no activity for 60 seconds, consider connection stale
      if (timeSinceLastActivity > 60000) {
        console.warn('MCP connection appears stale, attempting reconnection...');
        this.connected = false;
        this.scheduleReconnect();
      }
    }, 30000); // Check every 30 seconds
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  cleanup() {
    this.stopHealthCheck();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionRequest) {
      this.connectionRequest.destroy();
      this.connectionRequest = null;
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
        this.lastActivity = Date.now();
        
        let buffer = '';
        
        res.on('data', (chunk) => {
          this.lastActivity = Date.now();
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
          this.scheduleReconnect();
        });
        
        res.on('error', (error) => {
          console.error('SSE response error:', error);
          this.connected = false;
          reject(error);
        });
        
        // Give it a moment to establish and receive initial messages
        setTimeout(async () => {
          if (this.mcpEndpoint) {
            console.log('MCP endpoint ready, initializing session...');
            try {
              await this.initializeMCPSession();
              console.log('MCP session initialized successfully');
              this.connected = true; // Only set connected after successful session init
              resolve();
            } catch (error) {
              console.error('Failed to initialize MCP session:', error);
              this.connected = false;
              reject(error);
            }
          } else {
            console.log('No MCP endpoint received');
            this.connected = false;
            reject(new Error('No MCP endpoint received from server'));
          }
        }, 2000);
      });
      
      req.on('error', (error) => {
        console.error('SSE request error:', error);
        this.connected = false;
        reject(error);
      });
      
      // Store the request for cleanup
      this.connectionRequest = req;
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
    }, true); // Allow during initialization
    
    console.log('MCP session initialized:', initResponse);
    
    // Send initialized notification
    await this.sendMCPNotification('notifications/initialized', {}, true); // Allow during initialization
    
    // Query available tools
    try {
      const toolsResponse = await this.sendMCPRequest('tools/list', {}, true); // Allow during initialization
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
  
  isConnected() {
    return this.connected && this.httpClient && this.mcpEndpoint;
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      hasHttpClient: !!this.httpClient,
      hasEndpoint: !!this.mcpEndpoint,
      reconnectAttempts: this.reconnectAttempts,
      isReconnecting: this.isReconnecting,
      lastActivity: this.lastActivity
    };
  }

  async sendMCPRequest(method, params = {}, allowDuringInit = false) {
    // Allow initialization requests even when not fully connected
    if (!allowDuringInit && !this.isConnected()) {
      throw new Error(`MCP client not connected. Status: ${JSON.stringify(this.getConnectionStatus())}`);
    }
    
    // For initialization, we only need httpClient and mcpEndpoint
    if (!this.httpClient || !this.mcpEndpoint) {
      throw new Error(`MCP client missing required components. Status: ${JSON.stringify(this.getConnectionStatus())}`);
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
  
  async sendMCPNotification(method, params = {}, allowDuringInit = false) {
    // Allow initialization notifications even when not fully connected
    if (!allowDuringInit && !this.isConnected()) {
      throw new Error('MCP client not connected');
    }
    
    // For initialization, we only need httpClient and mcpEndpoint
    if (!this.httpClient || !this.mcpEndpoint) {
      throw new Error('MCP client missing required components');
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
    const startTime = Date.now();
    console.log('[MCP-PERF] Starting getLiveContext call...');
    
    try {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'GetLiveContext',
        arguments: {}
      });
      
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response).length;
      console.log(`[MCP-PERF] getLiveContext completed in ${duration}ms, response size: ${responseSize} bytes`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[MCP-PERF] getLiveContext failed after ${duration}ms:`, error.message);
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