# Home Assistant Dashboard - Project Context

## Core Philosophy: "Human-Centric Automation"
- **Smart homes should anticipate human needs, not wait for commands**
- **Dashboard = Cockpit for monitoring, NOT control panel**
- **Humans shouldn't need voice commands or button presses**
- **Automation should be invisible until intervention is needed**

## Architecture Overview
- **Frontend**: Angular 17 with Material Design
- **Backend**: Node.js with Express + WebSocket
- **Integration**: Direct MCP connection to Home Assistant (NOT proxy)
- **Camera**: Blue Iris RTSP streams with MQTT alerts
- **Testing**: Jest framework with 15 unit tests

## Alert Philosophy: ALERT vs NOTIFY
- **ALERT**: Urgent, requires immediate attention (strobes, persistent UI)
  - Lock jammed, leak detected, smoke/fire, CO2, person at door
- **NOTIFY**: Informational, temporary (toasters, auto-dismiss)
  - Appliance done, motion detection, arrivals/departures
- **Escalation**: NOTIFY → ALERT if unresolved (temp alerts, doors left open)

## Critical Design Principles
1. **Dynamic & Future-Proof**: Never hardcode device names/IDs
2. **Area-Based**: Use HA Areas for zone management
3. **Device-Class Driven**: Categorize by attributes, not names
4. **Minimalist UI**: Clean when normal, expand when issues arise
5. **Speed Critical**: Sub-second camera feeds for security

## Technical Stack
- **MCP Integration**: Direct SSE connection, custom auth handling
- **Device Control**: "tools/call" format with HassTurnOn/HassTurnOff
- **Real-time**: WebSocket + 10-second polling for dashboard updates
- **Camera**: RTSP direct to Blue Iris sub-streams (fastest)

## Blue Iris Setup
- **Server**: http://192.168.0.13:81/
- **Auth**: dashboard:D@sh!Board123
- **Cameras**: BackyardEast, FrontDoor, Doorbell (TrackMix = invalid)
- **Format**: `rtsp://dashboard:D@sh!Board123@192.168.0.13:81/[camera]&w=640&h=480`

## Priority Monitoring Zones
1. **High-Value**: Theater (AV equipment), Garage (vehicles/tools)
2. **Security**: All exterior doors, gates, perimeter motion
3. **Safety**: Leak sensors, temperature monitoring, lock status
4. **Automation Health**: Strobe system, battery levels, device connectivity

## Current Status - Sprint 4 COMPLETE ✅
- ✅ **Sprint 1**: MCP integration + device caching (500ms polling, 312 relevant entities)
- ✅ **Sprint 2**: Frontend integration + "All Quiet" indicators + 100ms UI updates
- ✅ **Sprint 3**: Camera grid foundation with RTSP stream integration
- ✅ **Camera Grid Foundation**: Above-the-fold layout with large + small camera feeds
- ✅ **MQTT Alert Integration**: Real entity detection (`Doorbell Person Detected MQTT`, etc.)
- ✅ **15-Second Rotation**: Always-visible cameras (FrontDoor, Front Yard, Garage)
- ✅ **Critical Status Summary**: Top-left security overview (doors, alerts)
- ✅ **Alert Priority System**: Latest MQTT alert wins large camera square
- ✅ **Responsive Layout**: Desktop/tablet above-fold, mobile stacked
- ✅ **MJPEG Stream Integration**: Browser-compatible streams with Blue Iris proxy
- ✅ **Camera Overlay Component**: Fullscreen viewing with click-to-expand functionality
- ✅ **MCP Auto-Reconnection**: Exponential backoff retry logic for Home Assistant connection
- ✅ **Camera Overlay Fixes**: MJPEG cache-busting and Angular change detection fixes
- 🔄 **Next**: Performance testing on iPhone Pro and 42-inch TV displays

## Key Lessons Learned - Technical
- **MCP Architecture**: Proxy ≠ server (proxy for Claude Code only)
- **MCP Response Format**: New structure uses `result.content[0].text` with JSON parsing
- **Tool Names**: "HassTurnOff" not "mcp__homeassistant__HassTurnOff"
- **Performance**: 500ms polling = 89ms MCP + 2ms parsing (449→312 entities filtered)
- **UI Responsiveness**: 100ms frontend updates for near real-time dashboard
- **MQTT Integration**: Use exact entity names (`Doorbell Person Detected MQTT`)
- **Above-Fold Design**: Critical info + cameras must be visible without scrolling
- **Cache Timing**: Start device cache AFTER MCP initialization (race condition fix)
- **MCP Reconnection**: Use `allowDuringInit` flag to avoid circular dependency deadlock
- **MJPEG Streams**: Browser compatibility requires cache-busting and stable URL binding
- **Blue Iris Integration**: Use query params (`?user=&pw=`) not HTTP auth for browser compatibility
- **Angular Change Detection**: Avoid function calls in templates for dynamic URLs