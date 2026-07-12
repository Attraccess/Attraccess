import { CompanionDevice } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

// ─── Client → Server DTOs ────────────────────────────────────────────────────

export class CompanionAuthenticateDto {
  @ApiProperty({ description: 'Stored device ID (omit on first run)', required: false })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ description: 'Stored device token (omit on first run)', required: false })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({ description: 'OS platform (e.g. linux, darwin, win32)', required: false })
  @IsOptional()
  @IsIn(['linux', 'darwin', 'win32'])
  platform?: string;

  @ApiProperty({ description: 'CPU architecture (e.g. x64, arm64)', required: false })
  @IsOptional()
  @IsString()
  arch?: string;

  @ApiProperty({ description: 'Companion app version', required: false })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

// ─── Server → Client DTOs ────────────────────────────────────────────────────

export class CompanionResourceDto {
  @ApiProperty({ description: 'Resource ID' })
  id!: number;

  @ApiProperty({ description: 'Resource display name' })
  name!: string;
}

export class CompanionRegisterResponseDto {
  @ApiProperty({ description: 'Assigned device ID — persist in OS keychain' })
  id!: number;

  @ApiProperty({ description: 'Device token — persist in OS keychain' })
  token!: string;
}

export class CompanionAuthenticatedDto {
  @ApiProperty({ description: 'Device ID' })
  deviceId!: number;

  @ApiProperty({ description: 'Admin-assigned device display name' })
  deviceName!: string;

  @ApiProperty({ description: 'Resources this device controls', type: [CompanionResourceDto] })
  resources!: CompanionResourceDto[];

  @ApiProperty({ description: 'Whether the device should be locked right now (persisted across restarts)' })
  locked!: boolean;
}

export class CompanionDeviceRenamedDto {
  @ApiProperty({ description: 'New device name' })
  deviceName!: string;
}

export class CompanionUpdateAvailableDto {
  @ApiProperty({ description: 'Direct download URL for the new binary' })
  downloadUrl!: string;

  @ApiProperty({ description: 'New version string' })
  version!: string;

  @ApiProperty({ description: 'SHA-256 hex digest of the binary for integrity verification', required: false })
  sha256?: string;
}

export class CompanionIdleDto {
  @ApiProperty({ description: 'Seconds the machine has been idle' })
  @IsNumber()
  idleSeconds!: number;

  @ApiProperty({ description: 'OS platform', required: false })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class CompanionForegroundAppDto {
  @ApiProperty({ description: 'Application display name' })
  @IsNotEmpty()
  @IsString()
  appName!: string;

  @ApiProperty({ description: 'Bundle ID (macOS only)', required: false })
  @IsOptional()
  @IsString()
  bundleId?: string;

  @ApiProperty({ description: 'Process ID' })
  @IsInt()
  pid!: number;
}

// ─── Socket type ─────────────────────────────────────────────────────────────

export enum CompanionEventType {
  COMPANION_REQUEST_AUTHENTICATION = 'COMPANION_REQUEST_AUTHENTICATION',
  COMPANION_AUTHENTICATE = 'COMPANION_AUTHENTICATE',
  COMPANION_REGISTER = 'COMPANION_REGISTER',
  COMPANION_REGISTER_RESPONSE = 'COMPANION_REGISTER_RESPONSE',
  COMPANION_AUTHENTICATED = 'COMPANION_AUTHENTICATED',
  COMPANION_UNAUTHORIZED = 'COMPANION_UNAUTHORIZED',
  COMPANION_LOCK_PC = 'COMPANION_LOCK_PC',
  COMPANION_UNLOCK_PC = 'COMPANION_UNLOCK_PC',
  COMPANION_UPDATE_AVAILABLE = 'COMPANION_UPDATE_AVAILABLE',
  COMPANION_IDLE = 'COMPANION_IDLE',
  COMPANION_ACTIVE = 'COMPANION_ACTIVE',
  COMPANION_DEVICE_RENAMED = 'COMPANION_DEVICE_RENAMED',
  COMPANION_FOREGROUND_APP = 'COMPANION_FOREGROUND_APP',
}

export interface CompanionAuthenticatePayload {
  id?: number;
  token?: string;
  platform?: string;
  arch?: string;
  appVersion?: string;
}

export interface CompanionSocket extends Omit<WebSocket, 'send'> {
  id: string;
  deviceId: CompanionDevice['id'] | null;
  platform: string | null;
  arch: string | null;
  send: (data: string) => void;
  sendEvent: (type: CompanionEventType, payload: unknown) => void;
}

// ponytail: alias for gateway code that predates CompanionSocket
export type CompanionWebSocket = CompanionSocket;
