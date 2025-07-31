# Home Assistant Dashboard

A modern, responsive web application for controlling and monitoring Home Assistant devices. Built with Angular frontend and Node.js backend, integrated with Home Assistant via MCP (Model Context Protocol).

## Features

- **Smart Device Visibility**: Only shows devices that need attention (lights on, doors open, etc.)
- **Responsive Design**: Works seamlessly from iPhone to 42" TV displays
- **Real-time Updates**: WebSocket integration for live device state updates
- **Dark Theme**: Beautiful dark UI optimized for always-on displays
- **Touch-Friendly**: Large touch targets optimized for wall-mounted tablets
- **Category Summaries**: Quick overview cards showing overall status
- **MCP Integration**: Uses the same MCP server as Claude Code for consistent device access

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Angular UI    │◄──►│   Node.js API   │◄──►│   MCP Server    │◄──►│ Home Assistant  │
│                 │    │                 │    │                 │    │                 │
│ - Dashboard     │    │ - REST API      │    │ - Device        │    │ - Devices       │
│ - Device Cards  │    │ - WebSockets    │    │   Control       │    │ - Sensors       │
│ - Responsive    │    │ - MCP Client    │    │ - State Query   │    │ - Automation    │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

- Node.js 18+ and npm
- Angular CLI (installed globally)
- Home Assistant MCP server (from homeassistant-mcp-project)
- Home Assistant instance with configured devices

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/masterloucks/homeassistant-dashboard.git
cd homeassistant-dashboard
```

### 2. Install Dependencies

```bash
# Install root dependencies and all sub-projects
npm run install-all

# Or install manually:
npm install
cd frontend && npm install
cd ../backend && npm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp backend/.env.example backend/.env

# Edit configuration
nano backend/.env
```

Update the MCP_PROXY_PATH to point to your homeassistant-mcp-project directory.

### 4. Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run frontend  # Angular dev server on http://localhost:4200
npm run backend   # Node.js API server on http://localhost:3000
```

## Configuration

### Backend Configuration (backend/.env)

```env
PORT=3000
MCP_PROXY_PATH=../homeassistant-mcp-project/mcp-proxy
ALLOWED_ORIGINS=http://localhost:4200
```

### MCP Server Setup

Ensure your Home Assistant MCP server is properly configured and running. The dashboard connects to the same MCP server that Claude Code uses.

## Device Categories

The dashboard organizes devices into smart categories:

### 🚪 Doors
- **All OK**: "All doors closed and locked"
- **Attention Needed**: Shows individual open doors, unlocked locks, or garage doors

### 💡 Lights  
- **All OK**: "All lights are off"
- **Attention Needed**: Shows individual lights that are currently on

### 🛡️ Security
- **All OK**: "All security sensors clear"  
- **Attention Needed**: Shows motion sensors active, doors open, or locks unlocked

### 🌡️ Climate
- Always visible showing temperature readings and climate controls

### 🎵 Media
- **All OK**: "No active media players"
- **Attention Needed**: Shows currently playing or paused media players

## Responsive Breakpoints

- **Mobile (< 768px)**: Single column, large touch targets
- **Tablet (768px - 1200px)**: 2-3 column grid
- **Desktop/TV (> 1200px)**: Multi-column grid with larger icons

## API Endpoints

### Device Control
- `GET /api/dashboard-state` - Get current dashboard state
- `POST /api/toggle-device` - Toggle device on/off
- `POST /api/set-brightness` - Set light brightness (0-100)
- `POST /api/set-fan-speed` - Set fan speed percentage
- `POST /api/set-temperature` - Set thermostat temperature
- `POST /api/media-control` - Control media players (play/pause/next/previous)
- `POST /api/activate-scene` - Activate Home Assistant scene

### System
- `GET /api/health` - Health check endpoint

## WebSocket Events

- `dashboard-update` - Real-time dashboard state updates
- `request-dashboard-state` - Request current state
- `error` - Error notifications

## Development

### Project Structure

```
homeassistant-dashboard/
├── frontend/                 # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/   # UI components
│   │   │   ├── services/     # Angular services
│   │   │   └── models/       # TypeScript interfaces
│   │   └── styles.scss       # Global dark theme
│   ├── angular.json          # Angular configuration
│   └── package.json
├── backend/                  # Node.js API server
│   ├── src/
│   │   ├── server.js         # Express server & WebSocket setup
│   │   ├── mcp-client.js     # MCP protocol client
│   │   └── device-service.js # Device categorization logic
│   └── package.json
├── package.json              # Root package with scripts
└── README.md
```

### Adding New Device Types

1. **Update Models** (`frontend/src/app/models/device.model.ts`)
2. **Update Device Service** (`backend/src/device-service.js`)
3. **Add UI Components** (device icons, card layouts)
4. **Update Categorization Logic**

### Customizing Themes

Edit `frontend/src/styles.scss` to customize:
- Color palette
- Card styles  
- Responsive breakpoints
- Icon sizes

## Deployment

### Production Build

```bash
# Build frontend for production
cd frontend && npm run build

# The build artifacts will be in frontend/dist/
```

### Docker Deployment

```bash
# Build and run with Docker
docker build -t homeassistant-dashboard .
docker run -p 3000:3000 -p 4200:4200 homeassistant-dashboard
```

### Nginx Configuration

For production deployment behind Nginx:

```nginx
upstream dashboard-backend {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-dashboard-domain.com;
    
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://dashboard-backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /socket.io {
        proxy_pass http://dashboard-backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Troubleshooting

### Common Issues

1. **Dashboard shows "Unable to Connect"**
   - Verify MCP server is running
   - Check MCP_PROXY_PATH in backend/.env
   - Ensure Home Assistant is accessible

2. **Devices not appearing**
   - Check Home Assistant device configuration
   - Verify MCP server has proper Home Assistant credentials
   - Look at backend console logs for parsing errors

3. **Real-time updates not working**
   - Check WebSocket connection in browser dev tools
   - Verify CORS configuration
   - Ensure no firewall blocking WebSocket connections

4. **Mobile/tablet display issues**
   - Clear browser cache
   - Check viewport meta tag
   - Verify responsive CSS media queries

### Debug Mode

Enable debug logging:

```bash
# Backend debug mode
DEBUG=* npm run dev

# View browser console for frontend issues
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Related Projects

- [Home Assistant MCP Server](https://github.com/jloucks/homeassistant-mcp) - MCP integration for Home Assistant
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - AI coding assistant with MCP support