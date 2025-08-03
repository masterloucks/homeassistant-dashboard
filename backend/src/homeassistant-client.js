const axios = require('axios');

class HomeAssistantClient {
  constructor() {
    this.baseURL = process.env.HOME_ASSISTANT_URL || 'http://localhost:8123';
    this.token = process.env.HOME_ASSISTANT_TOKEN;
    this.connected = false;
    
    if (!this.token) {
      console.warn('HOME_ASSISTANT_TOKEN not set. Please configure your Home Assistant access token.');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  async initialize() {
    try {
      console.log('Connecting to Home Assistant at:', this.baseURL);
      
      // Test the connection by getting states
      const response = await this.client.get('/api/states');
      this.connected = true;
      
      console.log(`Successfully connected to Home Assistant (${response.data.length} entities found)`);
      return true;
    } catch (error) {
      console.error('Failed to connect to Home Assistant:', error.message);
      this.connected = false;
      return false;
    }
  }

  async getStates() {
    try {
      const response = await this.client.get('/api/states');
      return response.data;
    } catch (error) {
      console.error('Error getting states:', error.message);
      throw error;
    }
  }

  async callService(domain, service, entityData = {}) {
    try {
      const response = await this.client.post(`/api/services/${domain}/${service}`, entityData);
      return response.data;
    } catch (error) {
      console.error(`Error calling service ${domain}.${service}:`, error.message);
      throw error;
    }
  }

  async turnOn(entityId) {
    const domain = entityId.split('.')[0];
    return await this.callService(domain, 'turn_on', { entity_id: entityId });
  }

  async turnOff(entityId) {
    const domain = entityId.split('.')[0];
    return await this.callService(domain, 'turn_off', { entity_id: entityId });
  }

  async setLightBrightness(entityId, brightness) {
    return await this.callService('light', 'turn_on', { 
      entity_id: entityId, 
      brightness: Math.round((brightness / 100) * 255) 
    });
  }

  async setFanSpeed(entityId, percentage) {
    return await this.callService('fan', 'set_percentage', { 
      entity_id: entityId, 
      percentage 
    });
  }

  async setClimateTemperature(entityId, temperature) {
    return await this.callService('climate', 'set_temperature', { 
      entity_id: entityId, 
      temperature 
    });
  }

  async controlMediaPlayer(entityId, action) {
    let service;
    switch (action) {
      case 'play':
        service = 'media_play';
        break;
      case 'pause':
        service = 'media_pause';
        break;
      case 'next':
        service = 'media_next_track';
        break;
      case 'previous':
        service = 'media_previous_track';
        break;
      default:
        throw new Error(`Unknown media action: ${action}`);
    }
    
    return await this.callService('media_player', service, { entity_id: entityId });
  }

  isConnected() {
    return this.connected;
  }

  disconnect() {
    this.connected = false;
  }
}

module.exports = new HomeAssistantClient();