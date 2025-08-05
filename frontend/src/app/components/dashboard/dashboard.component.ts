import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { HomeAssistantService } from '../../services/homeassistant.service';
import { DashboardState, Device, DeviceGroup } from '../../models/device.model';
import { DeviceCardComponent } from '../device-card/device-card.component';
import { CameraGridComponent } from '../camera-grid/camera-grid.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    DeviceCardComponent,
    CameraGridComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  dashboardState: DashboardState | null = null;
  connected = false;
  loading = true;
  private destroy$ = new Subject<void>();

  constructor(
    private haService: HomeAssistantService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.haService.isConnected()
      .pipe(takeUntil(this.destroy$))
      .subscribe(connected => {
        this.connected = connected;
        if (!connected && !this.loading) {
          this.snackBar.open('Connection to Home Assistant lost', 'Dismiss', {
            duration: 5000,
            panelClass: 'error-snackbar'
          });
        }
      });

    this.haService.getDashboardState()
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.dashboardState = state;
        this.loading = false;
        if (state && this.connected) {
          console.log('Dashboard state updated:', state);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDeviceClick(device: Device): void {
    if (this.isClickableDevice(device)) {
      this.haService.toggleDevice(device.id).subscribe({
        next: () => {
          this.snackBar.open(`${device.name} toggled`, 'Dismiss', {
            duration: 2000
          });
        },
        error: (error) => {
          this.snackBar.open(`Failed to toggle ${device.name}`, 'Dismiss', {
            duration: 3000,
            panelClass: 'error-snackbar'
          });
          console.error('Toggle error:', error);
        }
      });
    }
  }

  isClickableDevice(device: Device): boolean {
    return ['light', 'switch', 'fan', 'scene'].includes(device.domain);
  }

  getVisibleDevices(group: DeviceGroup): Device[] {
    if (group.allOk) {
      return [];
    }
    return group.devices.filter(device => this.shouldShowDevice(device));
  }

  private shouldShowDevice(device: Device): boolean {
    switch (device.domain) {
      case 'light':
      case 'switch':
      case 'fan':
        return device.state === 'on';
      case 'cover':
        return device.state === 'open';
      case 'binary_sensor':
        return device.state === 'on' && device.attributes?.deviceClass === 'opening';
      case 'lock':
        return device.state === 'unlocked';
      case 'media_player':
        return device.state !== 'off' && device.state !== 'unavailable';
      default:
        return false;
    }
  }

  getDeviceIcon(device: Device): string {
    switch (device.domain) {
      case 'light':
        return device.state === 'on' ? 'lightbulb' : 'lightbulb_outline';
      case 'switch':
        return device.state === 'on' ? 'power' : 'power_off';
      case 'fan':
        return 'air';
      case 'cover':
        return device.attributes?.deviceClass === 'garage' ? 'garage' : 
               device.state === 'open' ? 'sensor_door' : 'door_front';
      case 'lock':
        return device.state === 'locked' ? 'lock' : 'lock_open';
      case 'binary_sensor':
        if (device.attributes?.deviceClass === 'motion') return 'directions_run';
        if (device.attributes?.deviceClass === 'opening') return 'sensor_door';
        return 'sensors';
      case 'sensor':
        if (device.attributes?.deviceClass === 'temperature') return 'thermostat';
        if (device.attributes?.deviceClass === 'humidity') return 'water_drop';
        return 'sensors';
      case 'climate':
        return 'thermostat';
      case 'media_player':
        if (device.attributes?.deviceClass === 'tv') return 'tv';
        if (device.attributes?.deviceClass === 'speaker') return 'speaker';
        return 'play_circle';
      case 'scene':
        return 'palette';
      default:
        return 'device_unknown';
    }
  }

  getSummaryIcon(category: string): string {
    switch (category.toLowerCase()) {
      case 'doors': return 'door_front';
      case 'lights': return 'lightbulb';
      case 'climate': return 'thermostat';
      case 'security': return 'security';
      case 'media': return 'play_circle';
      default: return 'home';
    }
  }

  getDeviceCount(): number {
    if (!this.dashboardState) return 0;
    
    let totalDevices = 0;
    totalDevices += this.dashboardState.doors?.devices?.length || 0;
    totalDevices += this.dashboardState.lights?.devices?.length || 0;
    totalDevices += this.dashboardState.security?.devices?.length || 0;
    totalDevices += this.dashboardState.climate?.devices?.length || 0;
    totalDevices += this.dashboardState.media?.devices?.length || 0;
    
    return totalDevices;
  }

  getLastUpdateTime(): string {
    if (!this.dashboardState?.metadata?.lastUpdate) {
      return 'Never';
    }
    
    // Format to MT timezone
    const updateTime = new Date(this.dashboardState.metadata.lastUpdate);
    return updateTime.toLocaleTimeString('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  }


  getLastActivityTime(group: DeviceGroup): string {
    if (!group.devices || group.devices.length === 0) {
      return 'Never';
    }

    // Find the most recent activity in this group
    let mostRecentActivity = 0;
    
    for (const device of group.devices) {
      if (device.lastChanged) {
        mostRecentActivity = Math.max(mostRecentActivity, device.lastChanged);
      }
    }

    if (mostRecentActivity === 0) {
      return 'Unknown';
    }

    // Format to MT timezone
    const activityTime = new Date(mostRecentActivity);
    const now = new Date();
    const diffMs = now.getTime() - activityTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else {
      return activityTime.toLocaleDateString('en-US', {
        timeZone: 'America/Denver',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  }

  onDeviceCountClick(): void {
    console.log('Manual refresh triggered from device count click');
    this.loading = true;
    
    this.haService.refreshDevices().subscribe({
      next: (response) => {
        this.snackBar.open(
          `Refreshed ${response.deviceCount} devices`, 
          'Dismiss', 
          { duration: 3000 }
        );
        this.loading = false;
      },
      error: (error) => {
        this.snackBar.open(
          'Failed to refresh devices', 
          'Dismiss', 
          { 
            duration: 3000,
            panelClass: 'error-snackbar'
          }
        );
        this.loading = false;
        console.error('Device refresh error:', error);
      }
    });
  }

  getDoorSecurityIcon(): string {
    if (!this.dashboardState?.doors) return 'lock_open';
    
    const openDoors = this.dashboardState.doors.devices.filter(device => 
      device.state === 'open' || device.state === 'on' || device.state === 'unlocked'
    );
    
    return openDoors.length === 0 ? 'lock' : 'lock_open';
  }

  getDoorSecurityTitle(): string {
    if (!this.dashboardState?.doors) return 'Door Status';
    
    const openDoors = this.dashboardState.doors.devices.filter(device => 
      device.state === 'open' || device.state === 'on' || device.state === 'unlocked'
    );
    
    if (openDoors.length === 0) {
      return 'All Secure';
    } else if (openDoors.length === 1) {
      return '1 Door Open';
    } else {
      return `${openDoors.length} Doors Open`;
    }
  }

  getDoorSecuritySummary(): string {
    if (!this.dashboardState?.doors) return 'Loading...';
    return this.dashboardState.doors.summary;
  }

  getSecurityAlertsIcon(): string {
    if (!this.dashboardState?.security) return 'security';
    return this.dashboardState.security.allOk ? 'shield' : 'warning';
  }
}