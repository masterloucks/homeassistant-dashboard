import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Device } from '../../models/device.model';

@Component({
  selector: 'app-device-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './device-card.component.html',
  styleUrls: ['./device-card.component.scss']
})
export class DeviceCardComponent {
  @Input() device!: Device;
  @Input() icon!: string;
  @Input() clickable = false;
  @Output() deviceClick = new EventEmitter<Device>();

  onCardClick(): void {
    if (this.clickable) {
      this.deviceClick.emit(this.device);
    }
  }

  getDeviceStatus(): string {
    switch (this.device.domain) {
      case 'light':
        if (this.device.state === 'on') {
          const brightness = this.device.attributes?.brightness;
          return brightness ? `${Math.round((brightness / 255) * 100)}%` : 'On';
        }
        return 'Off';
      
      case 'fan':
        if (this.device.state === 'on') {
          const percentage = this.device.attributes?.percentage;
          return percentage ? `${percentage}%` : 'On';
        }
        return 'Off';
      
      case 'sensor':
        const value = this.device.state;
        const unit = this.device.attributes?.unitOfMeasurement || '';
        return `${value}${unit}`;
      
      case 'climate':
        const temp = this.device.attributes?.temperature;
        const currentTemp = this.device.attributes?.currentTemperature;
        return currentTemp ? `${currentTemp}°F` : temp ? `Set: ${temp}°F` : this.device.state;
      
      case 'media_player':
        if (this.device.state === 'playing') {
          return this.device.attributes?.mediaTitle || 'Playing';
        }
        return this.capitalizeFirst(this.device.state);
      
      case 'cover':
        return this.capitalizeFirst(this.device.state);
      
      case 'binary_sensor':
        return this.device.state === 'on' ? 'Active' : 'Clear';
      
      case 'lock':
        return this.device.state === 'locked' ? 'Locked' : 'Unlocked';
      
      default:
        return this.capitalizeFirst(this.device.state);
    }
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  getCardClass(): string {
    const classes = ['device-card'];
    
    if (this.clickable) {
      classes.push('clickable');
    }
    
    if (this.device.state === 'on' || 
        this.device.state === 'open' || 
        this.device.state === 'unlocked' ||
        this.device.state === 'playing') {
      classes.push('active');
    }
    
    if (this.device.domain === 'binary_sensor' && 
        this.device.state === 'on' && 
        this.device.attributes?.deviceClass === 'motion') {
      classes.push('warning');
    }
    
    return classes.join(' ');
  }
}