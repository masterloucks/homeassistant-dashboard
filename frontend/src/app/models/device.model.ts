export interface Device {
  id: string;
  name: string;
  domain: DeviceDomain;
  state: string;
  area?: string;
  attributes?: DeviceAttributes;
  deviceClass?: string;
  lastChanged?: number;
}

export interface DeviceAttributes {
  brightness?: number;
  temperature?: number;
  humidity?: number;
  unitOfMeasurement?: string;
  deviceClass?: string;
  percentage?: number;
  volumeLevel?: number;
  mediaTitle?: string;
  mediaArtist?: string;
  [key: string]: any;
}

export type DeviceDomain = 
  | 'light' 
  | 'switch' 
  | 'sensor' 
  | 'binary_sensor' 
  | 'cover' 
  | 'fan' 
  | 'climate' 
  | 'media_player'
  | 'lock'
  | 'scene';

export interface DeviceGroup {
  category: string;
  summary: string;
  devices: Device[];
  allOk: boolean;
}

export interface DashboardMetadata {
  deviceCount: number;
  lastUpdate: number;
  timeSinceLastUpdate: number;
  lastDiscovery: number;
}

export interface DashboardState {
  doors: DeviceGroup;
  lights: DeviceGroup;
  climate: DeviceGroup;
  security: DeviceGroup;
  media: DeviceGroup;
  metadata?: DashboardMetadata;
}