import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { Device, DashboardState, DeviceGroup } from '../models/device.model';

@Injectable({
  providedIn: 'root'
})
export class HomeAssistantService {
  private readonly apiUrl = 'http://localhost:3000/api';
  private dashboardState$ = new BehaviorSubject<DashboardState | null>(null);
  private connected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    this.initializeConnection();
    this.startPeriodicUpdate();
  }

  private initializeConnection(): void {
    this.loadDashboardState().subscribe({
      next: (state) => {
        this.dashboardState$.next(state);
        this.connected$.next(true);
      },
      error: (error) => {
        if (error.status === 503) {
          console.log('MCP connection initializing, will retry automatically...');
          // Don't mark as disconnected, let periodic updates handle retry
        } else {
          console.error('Failed to connect to Home Assistant:', error);
          this.connected$.next(false);
        }
      }
    });
  }

  private startPeriodicUpdate(): void {
    interval(100).subscribe(() => {
      this.loadDashboardState().subscribe({
        next: (state) => {
          this.dashboardState$.next(state);
          this.connected$.next(true);
        },
        error: (error) => {
          if (error.status === 503) {
            console.log('MCP connection initializing, retrying...');
            // Don't mark as disconnected during initialization
          } else {
            console.error('Update failed:', error);
            this.connected$.next(false);
          }
        }
      });
    });
  }

  private loadDashboardState(): Observable<DashboardState> {
    return this.http.get<DashboardState>(`${this.apiUrl}/dashboard-state`);
  }

  getDashboardState(): Observable<DashboardState | null> {
    return this.dashboardState$.asObservable();
  }

  isConnected(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  toggleDevice(deviceId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/toggle-device`, { deviceId });
  }

  setDeviceBrightness(deviceId: string, brightness: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/set-brightness`, { deviceId, brightness });
  }

  setFanSpeed(deviceId: string, percentage: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/set-fan-speed`, { deviceId, percentage });
  }

  setClimateTemperature(deviceId: string, temperature: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/set-temperature`, { deviceId, temperature });
  }

  controlMediaPlayer(deviceId: string, action: 'play' | 'pause' | 'next' | 'previous'): Observable<any> {
    return this.http.post(`${this.apiUrl}/media-control`, { deviceId, action });
  }

  activateScene(sceneId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/activate-scene`, { sceneId });
  }

  refreshDevices(): Observable<any> {
    return this.http.post(`${this.apiUrl}/refresh-devices`, {});
  }
}