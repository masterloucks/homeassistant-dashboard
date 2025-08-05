import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { HomeAssistantService } from '../../services/homeassistant.service';
import { Device } from '../../models/device.model';
import { CameraOverlayComponent, CameraOverlayData } from '../camera-overlay/camera-overlay.component';

interface CameraConfig {
  name: string;
  streamUrl: string;
  mqttEntityId: string;
  alwaysVisible: boolean;
  position?: { row: number; col: number }; // For small squares
}

interface CameraState {
  config: CameraConfig;
  isAlerting: boolean;
  lastChanged: number | null;
  mqttDevice?: Device;
}

@Component({
  selector: 'app-camera-grid',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './camera-grid.component.html',
  styleUrls: ['./camera-grid.component.scss']
})
export class CameraGridComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Camera configuration with HTTP proxy streams (Blue Iris via backend)
  private cameraConfigs: CameraConfig[] = [
    {
      name: 'FrontDoor',
      streamUrl: 'http://localhost:3000/api/camera/FrontDoor',
      mqttEntityId: 'Front Door Camera Motion MQTT',
      alwaysVisible: true,
      position: { row: 0, col: 0 }
    },
    {
      name: 'FrontYard',
      streamUrl: 'http://localhost:3000/api/camera/FrontYard',
      mqttEntityId: 'Front Yard Motion MQTT',
      alwaysVisible: true,
      position: { row: 0, col: 1 }
    },
    {
      name: 'Garage',
      streamUrl: 'http://localhost:3000/api/camera/Garage',
      mqttEntityId: 'Garage Motion MQTT',
      alwaysVisible: true,
      position: { row: 0, col: 2 }
    },
    {
      name: 'Doorbell',
      streamUrl: 'http://localhost:3000/api/camera/Doorbell',
      mqttEntityId: 'Doorbell Person Detected MQTT',
      alwaysVisible: false
    },
    {
      name: 'BackyardEast',
      streamUrl: 'http://localhost:3000/api/camera/BackyardEast',
      mqttEntityId: 'Backyard East Camera Motion MQTT',
      alwaysVisible: false
    }
  ];

  cameraStates: CameraState[] = [];
  currentLargeCameraIndex = 0;
  alertOverrideCameraIndex: number | null = null;
  rotationTimer = 15000; // 15 seconds
  
  // Stream state management
  streamErrors: Map<string, boolean> = new Map();
  streamLoading: Map<string, boolean> = new Map();

  constructor(
    private haService: HomeAssistantService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.initializeCameraStates();
    this.startCameraRotation();
    this.subscribeToDeviceUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeCameraStates(): void {
    this.cameraStates = this.cameraConfigs.map(config => ({
      config,
      isAlerting: false,
      lastChanged: null,
      mqttDevice: undefined
    }));
  }

  private startCameraRotation(): void {
    // 15-second rotation for always-visible cameras
    interval(this.rotationTimer)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.alertOverrideCameraIndex === null) {
          this.rotateToNextAlwaysVisibleCamera();
        }
      });
  }

  private rotateToNextAlwaysVisibleCamera(): void {
    const alwaysVisibleIndices = this.cameraStates
      .map((state, index) => state.config.alwaysVisible ? index : -1)
      .filter(index => index !== -1);

    if (alwaysVisibleIndices.length > 0) {
      const currentIndex = alwaysVisibleIndices.indexOf(this.currentLargeCameraIndex);
      const nextIndex = (currentIndex + 1) % alwaysVisibleIndices.length;
      this.currentLargeCameraIndex = alwaysVisibleIndices[nextIndex];
    }
  }

  private subscribeToDeviceUpdates(): void {
    this.haService.getDashboardState()
      .pipe(takeUntil(this.destroy$))
      .subscribe(dashboardState => {
        if (dashboardState) {
          this.updateCameraStatesFromDevices(dashboardState);
          this.checkForNewAlerts();
        }
      });
  }

  private updateCameraStatesFromDevices(dashboardState: any): void {
    // Get all devices from all categories
    const allDevices: Device[] = [
      ...(dashboardState.doors?.devices || []),
      ...(dashboardState.lights?.devices || []),
      ...(dashboardState.security?.devices || []),
      ...(dashboardState.climate?.devices || []),
      ...(dashboardState.media?.devices || [])
    ];

    // Update camera states based on MQTT entities
    this.cameraStates.forEach(cameraState => {
      const mqttDevice = allDevices.find(device => 
        device.name === cameraState.config.mqttEntityId || 
        device.id === cameraState.config.mqttEntityId
      );

      if (mqttDevice) {
        cameraState.mqttDevice = mqttDevice;
        cameraState.isAlerting = mqttDevice.state === 'detected' || mqttDevice.state === 'on';
        cameraState.lastChanged = mqttDevice.lastChanged || null;
      }
    });
  }

  private checkForNewAlerts(): void {
    // Find the most recent alert
    const alertingCameras = this.cameraStates
      .map((state, index) => ({ state, index }))
      .filter(({ state }) => state.isAlerting)
      .sort((a, b) => (b.state.lastChanged || 0) - (a.state.lastChanged || 0));

    if (alertingCameras.length > 0) {
      // Latest alert wins the large square
      this.alertOverrideCameraIndex = alertingCameras[0].index;
      this.currentLargeCameraIndex = alertingCameras[0].index;
    } else {
      // No alerts, resume rotation
      this.alertOverrideCameraIndex = null;
    }
  }

  getCurrentLargeCamera(): CameraState | null {
    return this.cameraStates[this.currentLargeCameraIndex] || null;
  }

  getAlwaysVisibleCameras(): CameraState[] {
    return this.cameraStates.filter(state => state.config.alwaysVisible);
  }

  getCameraIcon(cameraState: CameraState): string {
    return cameraState.isAlerting ? 'videocam' : 'videocam_off';
  }

  getLastChangedText(cameraState: CameraState): string {
    if (!cameraState.lastChanged) return 'Never';

    const now = Date.now();
    const diffMs = now - cameraState.lastChanged;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours}h ago`;
    }
  }

  onCameraIconClick(cameraState: CameraState): void {
    this.openCameraOverlay(cameraState);
  }


  trackByCameraName(index: number, cameraState: CameraState): string {
    return cameraState.config.name;
  }

  // Video stream handling methods
  onVideoError(event: any, cameraName: string): void {
    console.warn(`Image stream error for ${cameraName}:`, event);
    this.streamErrors.set(cameraName, true);
    this.streamLoading.set(cameraName, false);
  }

  onVideoLoadStart(cameraName: string): void {
    console.log(`Image stream loading started for ${cameraName}`);
    this.streamLoading.set(cameraName, true);
    this.streamErrors.set(cameraName, false);
  }

  onVideoCanPlay(cameraName: string): void {
    console.log(`Image stream ready for ${cameraName}`);
    this.streamLoading.set(cameraName, false);
    this.streamErrors.set(cameraName, false);
  }

  getStreamError(cameraName: string): boolean {
    return this.streamErrors.get(cameraName) || false;
  }

  isStreamLoading(cameraName: string): boolean {
    return this.streamLoading.get(cameraName) || false;
  }

  getCameraPosterUrl(cameraName: string): string {
    // Return a placeholder poster image URL if needed
    // For now, we'll let the browser handle the default video poster
    return '';
  }

  openCameraOverlay(cameraState: CameraState): void {
    const dialogData: CameraOverlayData = {
      cameraName: cameraState.config.name,
      streamUrl: cameraState.config.streamUrl,
      isAlerting: cameraState.isAlerting
    };

    this.dialog.open(CameraOverlayComponent, {
      data: dialogData,
      panelClass: 'camera-overlay-dialog',
      hasBackdrop: true,
      disableClose: false
    });
  }
}