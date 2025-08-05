# Home Assistant Dashboard - Process Management Guide

This guide provides commands to independently start, stop, and restart both the MCP proxy and the dashboard components so they won't crash when Claude Code crashes.

## Prerequisites

- MCP Proxy location: `/Users/jason/homeassistant-mcp-project/`
- Dashboard location: `/Users/jason/homeassistant-dashboard/`
- Both should be run in separate terminals (NOT within Claude Code sessions)

---

## MCP Proxy Management

The MCP proxy handles communication between the dashboard and Home Assistant.

### Start MCP Proxy
```bash
cd /Users/jason/homeassistant-mcp-project
./run-mcp-proxy.sh
```

### Start MCP Proxy in Background
```bash
cd /Users/jason/homeassistant-mcp-project
nohup ./run-mcp-proxy.sh > ~/mcp-proxy.log 2>&1 &
```

### Check if MCP Proxy is Running
```bash
ps aux | grep mcp_proxy | grep -v grep
```

### Stop MCP Proxy
```bash
# Find the process ID and kill it
ps aux | grep mcp_proxy | grep -v grep
kill <PID>

# Or kill all mcp_proxy processes
pkill -f mcp_proxy
```

### Restart MCP Proxy
```bash
# Kill existing process
pkill -f mcp_proxy

# Start fresh
cd /Users/jason/homeassistant-mcp-project
./run-mcp-proxy.sh
```

---

## Dashboard Frontend & Backend Management

The dashboard consists of an Angular frontend (port 4200) and Node.js backend (port 3000).

### Start Both Frontend and Backend
```bash
cd /Users/jason/homeassistant-dashboard
npm run dev
```

### Start Only Backend (Node.js API)
```bash
cd /Users/jason/homeassistant-dashboard
npm run backend
```

### Start Only Frontend (Angular)
```bash
cd /Users/jason/homeassistant-dashboard
npm run frontend
```

### Start Dashboard in Background
```bash
cd /Users/jason/homeassistant-dashboard
nohup npm run dev > ~/dashboard.log 2>&1 &
```

### Check if Dashboard is Running
```bash
# Check by port
lsof -i :3000  # Backend API
lsof -i :4200  # Frontend dev server

# Check by process
ps aux | grep node | grep -E "(backend|frontend|angular)"
```

### Stop Dashboard
```bash
# Kill by port
lsof -ti:3000 | xargs kill  # Backend
lsof -ti:4200 | xargs kill  # Frontend

# Kill by process name
pkill -f "npm run dev"

# Kill all node processes (more aggressive)
pkill -f node
```

### Restart Dashboard
```bash
# Kill existing processes
pkill -f "npm run dev"

# Start fresh
cd /Users/jason/homeassistant-dashboard
npm run dev
```

---

## Process Management with PM2 (Advanced)

For more robust process management, you can use PM2:

### Install PM2
```bash
npm install -g pm2
```

### Start with PM2
```bash
# MCP Proxy
cd /Users/jason/homeassistant-mcp-project
pm2 start "./run-mcp-proxy.sh" --name "mcp-proxy"

# Dashboard
cd /Users/jason/homeassistant-dashboard
pm2 start "npm run dev" --name "ha-dashboard"
```

### PM2 Control Commands
```bash
pm2 list                    # List all processes
pm2 stop mcp-proxy         # Stop MCP proxy
pm2 stop ha-dashboard      # Stop dashboard
pm2 restart mcp-proxy      # Restart MCP proxy
pm2 restart ha-dashboard   # Restart dashboard
pm2 delete mcp-proxy       # Remove from PM2
pm2 delete ha-dashboard    # Remove from PM2
pm2 logs                   # View logs
pm2 monit                  # Monitor processes
```

---

## Preventing Crashes During Development

When making code changes while the dashboard is running independently:

### Frontend Changes (Angular)
- **No action needed** - Angular dev server auto-rebuilds
- Browser may need refresh to see changes
- WebSocket will reconnect automatically

### Backend Changes (Node.js)
- **Nodemon auto-restarts** the backend on file changes
- If you want to disable auto-restart during development:
  ```bash
  # Start backend without auto-restart
  cd /Users/jason/homeassistant-dashboard/backend
  node src/server.js
  ```
- To manually restart after changes:
  ```bash
  # Kill and restart
  lsof -ti:3000 | xargs kill
  cd /Users/jason/homeassistant-dashboard && npm run backend
  ```

### Stable Development Mode
For maximum stability during development, run each service separately:

```bash
# Terminal 1: MCP Proxy (most stable)
cd /Users/jason/homeassistant-mcp-project
./run-mcp-proxy.sh

# Terminal 2: Backend (no auto-restart)
cd /Users/jason/homeassistant-dashboard/backend
node src/server.js

# Terminal 3: Frontend (auto-rebuild enabled)
cd /Users/jason/homeassistant-dashboard/frontend
npm start
```

---

## Quick Start Commands

To get everything running quickly:

```bash
# Terminal 1: Start MCP Proxy
cd /Users/jason/homeassistant-mcp-project && ./run-mcp-proxy.sh

# Terminal 2: Start Dashboard
cd /Users/jason/homeassistant-dashboard && npm run dev
```

Access your dashboard at: **http://localhost:4200**

---

## Troubleshooting

### Port Already in Use
```bash
# Find what's using the port
lsof -i :3000
lsof -i :4200

# Kill the process using the port
lsof -ti:3000 | xargs kill
lsof -ti:4200 | xargs kill
```

### Check Logs
```bash
# If running in background, check logs
tail -f ~/mcp-proxy.log     # MCP proxy logs
tail -f ~/dashboard.log     # Dashboard logs

# PM2 logs
pm2 logs mcp-proxy
pm2 logs ha-dashboard
```

### Complete Reset
```bash
# Kill everything and start fresh
pkill -f mcp_proxy
pkill -f "npm run"
pkill -f node

# Wait a moment, then restart
cd /Users/jason/homeassistant-mcp-project && ./run-mcp-proxy.sh &
cd /Users/jason/homeassistant-dashboard && npm run dev
```