import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface CameraOverlayData {
  cameraName: string;
  streamUrl: string;
  isAlerting: boolean;
}

@Component({
  selector: 'app-camera-overlay',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="camera-overlay-container">
      <div class="overlay-header">
        <h2 mat-dialog-title>{{ data.cameraName }}</h2>
        <button mat-icon-button mat-dialog-close class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <div class="overlay-content" mat-dialog-content>
        <div class="fullscreen-video-container">
          <!-- MJPEG Image Stream with cache busting -->
          <img class="fullscreen-video"
               [src]="currentStreamUrl"
               [alt]="data.cameraName + ' camera feed'"
               (error)="onVideoError($event)"
               (load)="onVideoCanPlay()"
               #videoImg>
          
          <!-- Status indicator -->
          <div class="status-indicator" [class.alerting]="data.isAlerting">
            <mat-icon>{{ data.isAlerting ? 'warning' : 'videocam' }}</mat-icon>
            <span>{{ data.isAlerting ? 'MOTION DETECTED' : 'MONITORING' }}</span>
          </div>
          
          <!-- Error fallback -->
          <div class="video-error" *ngIf="hasVideoError">
            <mat-icon>videocam_off</mat-icon>
            <h3>Stream Unavailable</h3>
            <p>Unable to load camera feed for {{ data.cameraName }}</p>
            <button mat-raised-button color="primary" (click)="retryVideo()">
              <mat-icon>refresh</mat-icon>
              Retry
            </button>
          </div>
        </div>
      </div>
      
      <div class="overlay-actions" mat-dialog-actions>
        <button mat-raised-button color="primary" mat-dialog-close>
          Close
        </button>
      </div>
    </div>
  `,
  styles: [`
    .camera-overlay-container {
      width: 90vw;
      height: 90vh;
      max-width: 1200px;
      max-height: 800px;
      display: flex;
      flex-direction: column;
    }
    
    .overlay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      
      h2 {
        margin: 0;
        color: #ffffff;
        font-size: 24px;
        font-weight: 600;
      }
      
      .close-button {
        color: #ffffff;
      }
    }
    
    .overlay-content {
      flex: 1;
      padding: 0;
      overflow: hidden;
      position: relative;
    }
    
    .fullscreen-video-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .fullscreen-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: rgba(0, 0, 0, 0.9);
    }
    
    .status-indicator {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 20px;
      color: #4fc3f7;
      font-size: 14px;
      font-weight: 600;
      
      &.alerting {
        background: rgba(255, 87, 34, 0.9);
        color: #ffffff;
        animation: pulse 1.5s infinite;
      }
      
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    
    .video-error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #ffffff;
      
      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: #f44336;
        margin-bottom: 16px;
      }
      
      h3 {
        margin: 0 0 8px 0;
        font-size: 24px;
        color: #f44336;
      }
      
      p {
        margin: 0 0 24px 0;
        opacity: 0.8;
      }
    }
    
    .overlay-actions {
      padding: 16px 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: flex-end;
    }
    
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.6; }
      100% { opacity: 1; }
    }
    
    @media (max-width: 768px) {
      .camera-overlay-container {
        width: 95vw;
        height: 95vh;
      }
      
      .overlay-header h2 {
        font-size: 20px;
      }
      
      .status-indicator {
        top: 12px;
        right: 12px;
        padding: 6px 12px;
        font-size: 12px;
      }
    }
  `]
})
export class CameraOverlayComponent implements OnInit, OnDestroy {
  hasVideoError = false;
  private refreshInterval: any;
  currentStreamUrl: string = '';

  constructor(
    public dialogRef: MatDialogRef<CameraOverlayComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CameraOverlayData
  ) {
    // Initialize with cache-busted URL
    this.currentStreamUrl = this.generateStreamUrl();
  }

  ngOnInit() {
    // Force refresh the stream periodically to ensure it stays live
    this.refreshInterval = setInterval(() => {
      this.refreshStream();
    }, 30000); // Refresh every 30 seconds
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  generateStreamUrl(): string {
    // Add timestamp to prevent caching issues with MJPEG streams
    const timestamp = Date.now();
    const separator = this.data.streamUrl.includes('?') ? '&' : '?';
    return `${this.data.streamUrl}${separator}_t=${timestamp}`;
  }

  refreshStream(): void {
    // Update the URL to force reload
    this.currentStreamUrl = this.generateStreamUrl();
  }

  onVideoError(event: any): void {
    console.warn(`Overlay video error for ${this.data.cameraName}:`, event);
    this.hasVideoError = true;
  }

  onVideoLoadStart(): void {
    console.log(`Overlay image loading for ${this.data.cameraName}`);
    this.hasVideoError = false;
  }

  onVideoCanPlay(): void {
    console.log(`Overlay image ready for ${this.data.cameraName}`);
    this.hasVideoError = false;
  }

  retryVideo(): void {
    this.hasVideoError = false;
    this.refreshStream();
  }
}