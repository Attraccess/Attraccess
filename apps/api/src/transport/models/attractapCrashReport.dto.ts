import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Attractap } from './attractap.dto';
import type { ResponseFields } from '../response-mapper';

export class AttractapCrashReport {
  @ApiProperty({ description: 'The unique identifier of the crash report', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the reader this crash report belongs to', example: 1 })
  attractapId!: number;

  @ApiProperty({
    description: 'The reset reason reported by the reader (esp_reset_reason)',
    example: 'TASK_WDT',
  })
  resetReason!: string;

  @ApiProperty({
    description:
      'Deliberate reboot reason set by the firmware before a self-triggered restart (e.g. websocket reconnect heap recovery). Null for ordinary/unexpected resets.',
    example: 'WEBSOCKET_RECONNECT_HEAP_EXHAUSTION',
    nullable: true,
  })
  rebootReason!: string | null;

  @ApiProperty({
    description: 'Free heap in bytes captured before the freeze/reset',
    example: 48213,
    nullable: true,
  })
  heapFreeBytes!: number | null;

  @ApiProperty({
    description: 'Largest contiguous free heap block in bytes before the freeze/reset',
    example: 20480,
    nullable: true,
  })
  largestFreeBlockBytes!: number | null;

  @ApiProperty({
    description: 'Uptime in milliseconds before the reset occurred',
    example: 372000,
    nullable: true,
  })
  uptimeBeforeResetMs!: number | null;

  @ApiProperty({
    description: 'WebSocket connection state at the time of the freeze/reset',
    example: 'CONNECTED',
    nullable: true,
  })
  wsState!: string | null;

  @ApiProperty({
    description: 'WiFi connection state at the time of the freeze/reset',
    example: 'GOT_IP',
    nullable: true,
  })
  wifiState!: string | null;

  @ApiProperty({
    description: 'Firmware version string reported by the reader at crash time',
    example: '1.2.3',
    nullable: true,
  })
  firmwareVersion!: string | null;

  @ApiProperty({
    description: 'Size of the attached coredump blob in bytes, if any',
    example: 16384,
    nullable: true,
  })
  coredumpSize!: number | null;

  @Exclude()
  coredump!: Buffer | null;

  @ApiProperty({
    description: 'Build id (app ELF SHA256) extracted from the coredump, used to match the ELF',
    example: 'f6899cb1067e5043',
    nullable: true,
  })
  coredumpBuildId!: string | null;

  @ApiProperty({
    description: 'Status of server-side coredump symbolication',
    example: 'success',
    enum: ['pending', 'success', 'failed', 'skipped', 'unavailable'],
    nullable: true,
  })
  symbolicationStatus!: string | null;

  @ApiProperty({
    description: 'Symbolized backtrace, task list, and register dump produced from the coredump + ELF',
    example: '#0  0x42066718 in app_loop() at main.cpp:120',
    nullable: true,
  })
  symbolizedBacktrace!: string | null;

  @ApiProperty({
    description: 'When this crash report was received by the server',
    example: '2026-06-02T12:00:00.000Z',
  })
  createdAt!: Date;

  @Exclude()
  attractap!: Attractap;
  static readonly responseFields: ResponseFields = {
    id: null,
    attractapId: null,
    resetReason: null,
    rebootReason: null,
    heapFreeBytes: null,
    largestFreeBlockBytes: null,
    uptimeBeforeResetMs: null,
    wsState: null,
    wifiState: null,
    firmwareVersion: null,
    coredumpSize: null,
    coredumpBuildId: null,
    symbolicationStatus: null,
    symbolizedBacktrace: null,
    createdAt: null,
  };
}
