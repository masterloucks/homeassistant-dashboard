const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
require('dotenv').config();

const mcpClient = require('./mcp-client');
const deviceService = require('./device-service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:4200",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard-state', async (req, res) => {
  try {
    if (!mcpClient.isConnected()) {
      const status = mcpClient.getConnectionStatus();
      console.warn('Dashboard state requested but MCP not connected yet');
      console.warn('MCP Connection status:', status);
      return res.status(503).json({ 
        error: 'MCP connection initializing', 
        message: 'Please wait for connection to Home Assistant',
        connectionStatus: status
      });
    }
    
    const dashboardState = await deviceService.getDashboardState();
    res.json(dashboardState);
  } catch (error) {
    console.error('Error getting dashboard state:', error);
    res.status(500).json({ error: 'Failed to get dashboard state' });
  }
});

app.post('/api/toggle-device', async (req, res) => {
  try {
    const { deviceId } = req.body;
    const result = await deviceService.toggleDevice(deviceId);
    
    // Emit update to all connected clients
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error toggling device:', error);
    res.status(500).json({ error: 'Failed to toggle device' });
  }
});

app.post('/api/refresh-devices', async (req, res) => {
  try {
    console.log('Manual device refresh requested via API');
    const result = await deviceService.manualDeviceRefresh();
    
    if (result.success) {
      // Emit updated dashboard state to all connected clients
      io.emit('dashboard-update', result.dashboardState);
      
      res.json({
        success: true,
        message: result.message,
        deviceCount: result.refreshInfo.deviceCount,
        lastUpdate: result.refreshInfo.lastStatusUpdate
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in manual device refresh:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh devices',
      message: error.message 
    });
  }
});

app.post('/api/set-brightness', async (req, res) => {
  try {
    const { deviceId, brightness } = req.body;
    const result = await deviceService.setBrightness(deviceId, brightness);
    
    // Emit update to all connected clients
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error setting brightness:', error);
    res.status(500).json({ error: 'Failed to set brightness' });
  }
});

app.post('/api/set-fan-speed', async (req, res) => {
  try {
    const { deviceId, percentage } = req.body;
    const result = await deviceService.setFanSpeed(deviceId, percentage);
    
    // Emit update to all connected clients
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error setting fan speed:', error);
    res.status(500).json({ error: 'Failed to set fan speed' });
  }
});

app.post('/api/set-temperature', async (req, res) => {
  try {
    const { deviceId, temperature } = req.body;
    const result = await deviceService.setTemperature(deviceId, temperature);
    
    // Emit update to all connected clients  
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error setting temperature:', error);
    res.status(500).json({ error: 'Failed to set temperature' });
  }
});

app.post('/api/media-control', async (req, res) => {
  try {
    const { deviceId, action } = req.body;
    const result = await deviceService.controlMedia(deviceId, action);
    
    // Emit update to all connected clients
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error controlling media:', error);
    res.status(500).json({ error: 'Failed to control media' });
  }
});

app.post('/api/activate-scene', async (req, res) => {
  try {
    const { sceneId } = req.body;
    const result = await deviceService.activateScene(sceneId);
    
    // Emit update to all connected clients
    const updatedState = await deviceService.getDashboardState();
    io.emit('dashboard-update', updatedState);
    
    res.json(result);
  } catch (error) {
    console.error('Error activating scene:', error);
    res.status(500).json({ error: 'Failed to activate scene' });
  }
});

// Camera proxy endpoint to handle Blue Iris streams
app.get('/api/camera/:cameraName', (req, res) => {
  const { cameraName } = req.params;
  const blueIrisOptions = {
    hostname: '192.168.0.13',
    port: 81,
    path: `/mjpg/${cameraName}?w=640&h=480&user=dashboard&pw=D@sh!Board123`,
    method: 'GET',
    headers: {
      'User-Agent': 'Dashboard-Backend/1.0.0'
    }
  };
  
  console.log(`[CAMERA-PROXY] Proxying stream for ${cameraName}: http://192.168.0.13:81${blueIrisOptions.path}`);
  
  // Set appropriate headers for MJPEG stream  
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary==STILLIMAGEBOUNDARY==');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Create request to Blue Iris
  const proxyReq = http.request(blueIrisOptions, (proxyRes) => {
    console.log(`[CAMERA-PROXY] Blue Iris response for ${cameraName}: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
    
    if (proxyRes.statusCode !== 200) {
      console.error(`[CAMERA-PROXY] Blue Iris error for ${cameraName}: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
      res.status(proxyRes.statusCode).json({ 
        error: `Camera stream error: ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
        camera: cameraName,
        suggestion: proxyRes.statusCode === 503 ? 'Camera may not exist or stream unavailable' : 'Check Blue Iris configuration'
      });
      return;
    }
    
    // Forward headers and stream data
    res.status(proxyRes.statusCode);
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    
    // Pipe the stream data
    proxyRes.pipe(res);
    
    proxyRes.on('error', (error) => {
      console.error(`[CAMERA-PROXY] Stream error for ${cameraName}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error', camera: cameraName });
      }
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error(`[CAMERA-PROXY] Request error for ${cameraName}:`, error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to connect to camera', 
        camera: cameraName,
        details: error.message 
      });
    }
  });
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[CAMERA-PROXY] Client disconnected from ${cameraName} stream`);
    proxyReq.destroy();
  });
  
  proxyReq.end();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('request-dashboard-state', async () => {
    try {
      const dashboardState = await deviceService.getDashboardState();
      socket.emit('dashboard-update', dashboardState);
    } catch (error) {
      console.error('Error sending dashboard state:', error);
      socket.emit('error', { message: 'Failed to get dashboard state' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Initialize MCP client and start periodic updates
async function initialize() {
  try {
    await mcpClient.initialize();
    console.log('MCP Client initialized successfully');
    
    // Start device cache refresh cycles now that MCP is ready
    const deviceCache = require('./device-cache');
    deviceCache.startRefreshCycles();
    
    // Start periodic dashboard state updates (every 2 seconds for UI responsiveness)
    setInterval(async () => {
      try {
        const dashboardState = await deviceService.getDashboardState();
        io.emit('dashboard-update', dashboardState);
      } catch (error) {
        console.error('Error in periodic dashboard update:', error);
      }
    }, 2000); // Update UI every 2 seconds (cache updates every 500ms)
    
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    process.exit(1);
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`Dashboard backend running on port ${PORT}`);
  initialize();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  mcpClient.cleanup();
  if (mcpClient.disconnect) {
    await mcpClient.disconnect();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  mcpClient.cleanup();
  if (mcpClient.disconnect) {
    await mcpClient.disconnect();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});