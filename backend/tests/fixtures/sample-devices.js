// Sample device data for testing
module.exports = {
  // Sample MCP live context response
  mockMCPResponse: {
    result: `Live Context: An overview of the areas and the devices in this smart home:
- names: Kitchen Light
  domain: light
  state: 'on'
  areas: Kitchen
  attributes:
    brightness: '255'
- names: Living Room Light
  domain: light
  state: 'off'
  areas: Living Room
  attributes:
    brightness: '0'
- names: Front Door
  domain: binary_sensor
  state: 'off'
  areas: Entryway
  attributes:
    device_class: opening
- names: Main Thermostat
  domain: climate
  state: 'heat'
  areas: Living Room
  attributes:
    temperature: '72'
    current_temperature: '70'
- names: Living Room TV
  domain: media_player
  state: 'playing'
  areas: Living Room
  attributes:
    volume_level: '0.5'
    media_title: 'Test Movie'`
  },

  // Parsed device objects
  parsedDevices: [
    {
      id: 'Kitchen Light',
      name: 'Kitchen Light',
      domain: 'light',
      state: 'on',
      area: 'Kitchen',
      attributes: {
        brightness: '255'
      }
    },
    {
      id: 'Living Room Light',
      name: 'Living Room Light',
      domain: 'light',
      state: 'off',
      area: 'Living Room',
      attributes: {
        brightness: '0'
      }
    },
    {
      id: 'Front Door',
      name: 'Front Door',
      domain: 'binary_sensor',
      state: 'off',
      area: 'Entryway',
      attributes: {
        device_class: 'opening'
      }
    },
    {
      id: 'Main Thermostat',
      name: 'Main Thermostat',
      domain: 'climate',
      state: 'heat',
      area: 'Living Room',
      attributes: {
        temperature: '72',
        current_temperature: '70'
      }
    },
    {
      id: 'Living Room TV',
      name: 'Living Room TV',
      domain: 'media_player',
      state: 'playing',
      area: 'Living Room',
      attributes: {
        volume_level: '0.5',
        media_title: 'Test Movie'
      }
    }
  ],

  // Expected categorization results
  expectedCategories: {
    lights: {
      category: 'Lights',
      summary: '1 light(s) currently on',
      allOk: false,
      deviceCount: 2
    },
    doors: {
      category: 'Doors',
      summary: 'All doors closed and locked',
      allOk: true,
      deviceCount: 1
    },
    climate: {
      category: 'Climate',
      summary: 'Climate monitoring active',
      allOk: true,
      deviceCount: 1
    },
    media: {
      category: 'Media',
      summary: '1 media player(s) active',
      allOk: false,
      deviceCount: 1
    }
  },

  // Temperature sensor devices for testing average calculation
  temperatureDevices: [
    {
      id: 'Kitchen Temp',
      name: 'Kitchen Temp',
      domain: 'sensor',
      state: '72',
      attributes: {
        device_class: 'temperature'
      }
    },
    {
      id: 'Living Room Temp',
      name: 'Living Room Temp', 
      domain: 'sensor',
      state: '70',
      attributes: {
        device_class: 'temperature'
      }
    },
    {
      id: 'Bedroom Temp',
      name: 'Bedroom Temp',
      domain: 'sensor',
      state: '68',
      attributes: {
        device_class: 'temperature'
      }
    }
  ]
};