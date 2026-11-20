import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Attractap } from './attractap.entity';

export type CoredumpStatus = 'awaiting' | 'stored' | 'rejected';

@Entity('attractap_crash_report')
@Index(['attractapId', 'createdAt'])
@Index('IDX_attractap_crash_report_created_at', ['createdAt'])
export class AttractapCrashReport {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the crash report', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the reader this crash report belongs to', example: 1 })
  attractapId!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The reset reason reported by the reader (esp_reset_reason)',
    example: 'TASK_WDT',
  })
  resetReason!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description:
      'Deliberate reboot reason set by the firmware before a self-triggered restart (e.g. websocket reconnect heap recovery). Null for ordinary/unexpected resets.',
    example: 'WEBSOCKET_RECONNECT_HEAP_EXHAUSTION',
    nullable: true,
  })
  rebootReason!: string | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty({
    description: 'Free heap in bytes captured before the freeze/reset',
    example: 48213,
    nullable: true,
  })
  heapFreeBytes!: number | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty({
    description: 'Largest contiguous free heap block in bytes before the freeze/reset',
    example: 20480,
    nullable: true,
  })
  largestFreeBlockBytes!: number | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty({
    description: 'Uptime in milliseconds before the reset occurred',
    example: 372000,
    nullable: true,
  })
  uptimeBeforeResetMs!: number | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'WebSocket connection state at the time of the freeze/reset',
    example: 'CONNECTED',
    nullable: true,
  })
  wsState!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'WiFi connection state at the time of the freeze/reset',
    example: 'GOT_IP',
    nullable: true,
  })
  wifiState!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Firmware version string reported by the reader at crash time',
    example: '1.2.3',
    nullable: true,
  })
  firmwareVersion!: string | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty({
    description: 'Size of the attached coredump blob in bytes, if any',
    example: 16384,
    nullable: true,
  })
  coredumpSize!: number | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description:
      'Upload state of the coredump: awaiting while a chunked upload is owed (or never arrived), stored once the whole dump was verified and saved, rejected when the server refused the announced dump (too large or invalid). Null for reports without a dump.',
    example: 'stored',
    enum: ['awaiting', 'stored', 'rejected'],
    nullable: true,
  })
  coredumpStatus!: CoredumpStatus | null;

  @Column({ type: 'bigint', nullable: true })
  @ApiProperty({
    description: 'Size in bytes of the coredump the reader announced for a chunked upload',
    example: 43776,
    nullable: true,
  })
  coredumpExpectedSize!: number | null;

  /** zlib CRC-32 the reader announced; a restarted upload must declare the same dump. */
  @Column({ type: 'bigint', nullable: true })
  @Exclude()
  coredumpExpectedCrc32!: number | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  @Exclude()
  coredump!: Buffer | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Build id (app ELF SHA256) extracted from the coredump, used to match the ELF',
    example: 'f6899cb1067e5043',
    nullable: true,
  })
  coredumpBuildId!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Status of server-side coredump symbolication',
    example: 'success',
    enum: ['pending', 'success', 'failed', 'skipped', 'unavailable'],
    nullable: true,
  })
  symbolicationStatus!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Symbolized backtrace, task list, and register dump produced from the coredump + ELF',
    example: '#0  0x42066718 in app_loop() at main.cpp:120',
    nullable: true,
  })
  symbolizedBacktrace!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({
    description: 'When this crash report was received by the server',
    example: '2026-06-02T12:00:00.000Z',
  })
  createdAt!: Date;

  @ManyToOne(() => Attractap, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attractapId' })
  @Exclude()
  attractap!: Attractap;
}
