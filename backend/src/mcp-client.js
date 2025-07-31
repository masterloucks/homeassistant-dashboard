const { spawn } = require('child_process');
const path = require('path');

class MCPClient {
  constructor() {
    this.mcpProcess = null;
    this.connected = false;
    this.responseCallbacks = new Map();
    this.requestId = 0;
  }

  async initialize() {
    console.log('Initializing MCP Client...');
    
    // Path to your MCP proxy server
    const mcpProxyPath = process.env.MCP_PROXY_PATH || '../homeassistant-mcp-project/mcp-proxy';
    const absoluteMcpPath = path.resolve(__dirname, '../../..', 'homeassistant-mcp-project/mcp-proxy');
    
    try {
      // Spawn the MCP server process
      this.mcpProcess = spawn('uv', ['run', 'homeassistant_mcp'], {
        cwd: absoluteMcpPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle process events
      this.mcpProcess.stdout.on('data', (data) => {
        this.handleResponse(data.toString());
      });

      this.mcpProcess.stderr.on('data', (data) => {
        console.error('MCP stderr:', data.toString());
      });

      this.mcpProcess.on('error', (error) => {
        console.error('MCP process error:', error);
        this.connected = false;
      });

      this.mcpProcess.on('exit', (code, signal) => {
        console.log(`MCP process exited with code ${code}, signal ${signal}`);
        this.connected = false;
      });

      // Wait a moment for the process to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test the connection
      await this.testConnection();
      this.connected = true;
      
      console.log('MCP Client connected successfully');
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const response = await this.sendRequest('GetLiveContext', {});
      if (response && response.result) {
        console.log('MCP connection test successful');
        return true;
      }
    } catch (error) {
      console.error('MCP connection test failed:', error);
      throw error;
    }
  }

  async sendRequest(toolName, parameters) {
    return new Promise((resolve, reject) => {
      if (!this.mcpProcess || !this.connected) {
        reject(new Error('MCP client not connected'));
        return;
      }

      const requestId = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      };

      // Store callback for this request
      this.responseCallbacks.set(requestId, { resolve, reject });

      // Send request
      const requestStr = JSON.stringify(request) + '\\n';
      this.mcpProcess.stdin.write(requestStr);

      // Set timeout
      setTimeout(() => {
        if (this.responseCallbacks.has(requestId)) {
          this.responseCallbacks.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  handleResponse(data) {
    const lines = data.trim().split('\\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const response = JSON.parse(line);
        
        if (response.id && this.responseCallbacks.has(response.id)) {
          const { resolve, reject } = this.responseCallbacks.get(response.id);
          this.responseCallbacks.delete(response.id);
          
          if (response.error) {
            reject(new Error(response.error.message || 'MCP request failed'));
          } else {
            resolve(response);
          }
        }
      } catch (error) {
        console.error('Error parsing MCP response:', error, 'Data:', line);
      }
    }
  }

  async getLiveContext() {
    const response = await this.sendRequest('mcp__homeassistant__GetLiveContext', {});
    return response.result;
  }

  async turnOn(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassTurnOn', criteria);
    return response.result;
  }

  async turnOff(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassTurnOff', criteria);
    return response.result;
  }

  async setLightBrightness(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassLightSet', criteria);
    return response.result;
  }

  async setFanSpeed(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassTurnOn', criteria);
    return response.result;
  }

  async setClimateTemperature(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassClimateSetTemperature', criteria);
    return response.result;
  }

  async controlMediaPlayer(criteria, action) {
    let methodName;
    switch (action) {
      case 'play':
        methodName = 'mcp__homeassistant__HassMediaUnpause';
        break;
      case 'pause':
        methodName = 'mcp__homeassistant__HassMediaPause';
        break;
      case 'next':
        methodName = 'mcp__homeassistant__HassMediaNext';
        break;
      case 'previous':
        methodName = 'mcp__homeassistant__HassMediaPrevious';
        break;
      default:
        throw new Error(`Unknown media action: ${action}`);
    }
    
    const response = await this.sendRequest(methodName, criteria);
    return response.result;
  }

  async setVolume(criteria) {
    const response = await this.sendRequest('mcp__homeassistant__HassSetVolume', criteria);
    return response.result;
  }

  async disconnect() {
    if (this.mcpProcess) {
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
    }
    this.connected = false;
    this.responseCallbacks.clear();
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = new MCPClient();