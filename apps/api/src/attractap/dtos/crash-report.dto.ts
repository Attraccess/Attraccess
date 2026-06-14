import { ApiProperty } from '@nestjs/swagger';

export class AttractapCrashReportDto {
  @ApiProperty({ description: 'The unique identifier of the crash report', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the reader this crash report belongs to', example: 1 })
  attractapId!: number;

  @ApiProperty({ description: 'The reset reason reported by the reader', example: 'TASK_WDT' })
  resetReason!: string;

  @ApiProperty({
    description: 'Optional deliberate reboot reason',
    example: 'WEBSOCKET_RECONNECT_HEAP_EXHAUSTION',
    nullable: true,
  })
  rebootReason!: string | null;

  @ApiProperty({ description: 'Free heap in bytes captured before reset', example: 48213, nullable: true })
  heapFreeBytes!: number | null;

  @ApiProperty({
    description: 'Largest contiguous free heap block in bytes before reset',
    example: 20480,
    nullable: true,
  })
  largestFreeBlockBytes!: number | null;

  @ApiProperty({ description: 'Uptime in milliseconds before reset', example: 372000, nullable: true })
  uptimeBeforeResetMs!: number | null;

  @ApiProperty({ description: 'WebSocket state before reset', example: 'CONNECTED', nullable: true })
  wsState!: string | null;

  @ApiProperty({ description: 'WiFi state before reset', example: 'GOT_IP', nullable: true })
  wifiState!: string | null;

  @ApiProperty({
    description: 'Firmware version reported by the reader at crash time',
    example: '1.3.23',
    nullable: true,
  })
  firmwareVersion!: string | null;

  @ApiProperty({
    description: 'Current firmware version last reported by this reader',
    example: '1.3.24',
    nullable: true,
  })
  currentReaderFirmwareVersion!: string | null;

  @ApiProperty({
    description: 'Latest firmware version currently bundled on the server for this reader type',
    example: '1.3.24',
    nullable: true,
  })
  latestServerFirmwareVersion!: string | null;

  @ApiProperty({
    description: 'Whether the crash firmware version matches the current reader firmware version',
    example: false,
    nullable: true,
  })
  firmwareMatchesCurrentReader!: boolean | null;

  @ApiProperty({
    description: 'Whether the crash firmware version matches the server-bundled firmware version',
    example: false,
    nullable: true,
  })
  firmwareMatchesLatestServer!: boolean | null;

  @ApiProperty({ description: 'Size of the attached coredump blob in bytes, if any', example: 16384, nullable: true })
  coredumpSize!: number | null;

  @ApiProperty({ description: 'Build id extracted from the coredump', example: 'f6899cb1067e5043', nullable: true })
  coredumpBuildId!: string | null;

  @ApiProperty({
    description: 'Whether the server currently has an ELF for the coredump build id',
    example: false,
    nullable: true,
  })
  coredumpBuildIdKnown!: boolean | null;

  @ApiProperty({
    description: 'Status of server-side coredump symbolication',
    example: 'failed',
    enum: ['pending', 'success', 'failed', 'skipped', 'unavailable'],
    nullable: true,
  })
  symbolicationStatus!: string | null;

  @ApiProperty({ description: 'Symbolized backtrace or symbolication failure details', nullable: true })
  symbolizedBacktrace!: string | null;

  @ApiProperty({
    description: 'When this crash report was received by the server',
    example: '2026-06-02T12:00:00.000Z',
  })
  createdAt!: Date;
}
