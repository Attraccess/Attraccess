import { CompanionDevice } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

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
}

export class CompanionUpdateAvailableDto {
  @ApiProperty({ description: 'Direct download URL for the new binary' })
  downloadUrl!: string;

  @ApiProperty({ description: 'New version string' })
  version!: string;
}

// ─── Socket type ─────────────────────────────────────────────────────────────

export enum CompanionEventType {
  COMPANION_REQUEST_AUTHENTICATION = 'COMPANION_REQUEST_AUTHENTICATION',
  COMPANION_AUTHENTICATE = 'COMPANION_AUTHENTICATE',
  COMPANION_REGISTER = 'COMPANION_REGISTER',
  COMPANION_AUTHENTICATED = 'COMPANION_AUTHENTICATED',
  COMPANION_UNAUTHORIZED = 'COMPANION_UNAUTHORIZED',
  COMPANION_LOCK_PC = 'COMPANION_LOCK_PC',
  COMPANION_UNLOCK_PC = 'COMPANION_UNLOCK_PC',
  COMPANION_UPDATE_AVAILABLE = 'COMPANION_UPDATE_AVAILABLE',
}

export interface CompanionAuthenticatePayload {
  id?: number;
  token?: string;
  platform?: string;
  appVersion?: string;
}

export interface CompanionSocket extends Omit<WebSocket, 'send'> {
  id: string;
  deviceId: CompanionDevice['id'] | null;
  send: (data: string) => void;
  sendEvent: (type: CompanionEventType, payload: unknown) => void;
}

// ponytail: alias for gateway code that predates CompanionSocket
export type CompanionWebSocket = CompanionSocket;
