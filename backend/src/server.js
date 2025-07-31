const express = require('express');
const cors = require('cors');
const http = require('http');
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
    
    // Start periodic dashboard state updates
    setInterval(async () => {
      try {
        const dashboardState = await deviceService.getDashboardState();
        io.emit('dashboard-update', dashboardState);
      } catch (error) {
        console.error('Error in periodic update:', error);
      }
    }, 10000); // Update every 10 seconds
    
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
  await mcpClient.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});