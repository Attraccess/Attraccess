import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';
import type { WhoCanBook } from '../settings/settings.model';

@Entity({ name: 'reservations_resource_settings' })
export class ResourceSettingsEntity {
  @PrimaryColumn({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'boolean', default: false })
  approvalRequired!: boolean;

  @Column({ type: 'integer', default: 15 })
  timeStepMinutes!: number;

  @Column({ type: 'integer', default: 15 })
  minDurationMinutes!: number;

  @Column({ type: 'integer', default: 240 })
  maxDurationMinutes!: number;

  @Column({ type: 'integer', default: 30 })
  maxAdvanceDays!: number;

  @Column({ type: 'integer', default: 0 })
  minLeadMinutes!: number;

  @Column({ type: 'integer', default: 0 })
  bufferBeforeMinutes!: number;

  @Column({ type: 'integer', default: 0 })
  bufferAfterMinutes!: number;

  @Column({ type: 'integer', default: 3 })
  maxActiveBookingsPerUser!: number;

  @Column({ type: 'varchar', default: 'can-start' })
  whoCanBook!: WhoCanBook;

  @Column({ type: 'integer', default: 60 })
  confirmWindowMinutes!: number;

  @Column({ type: 'boolean', default: true })
  checkInEnabled!: boolean;

  @Column({ type: 'integer', default: 15 })
  checkInGraceMinutes!: number;

  @Column({ type: 'integer', default: 15 })
  earlyCheckInMinutes!: number;

  @Column({ type: 'integer', default: 15 })
  handoverReminderMinutes!: number;

  @Column({ type: 'boolean', default: false })
  showNamesOnReaders!: boolean;

  /** JSON, see BookableHours. '{}' = bookable 24/7. */
  @Column({ type: 'text', default: '{}' })
  bookableHours!: string;

  @Column({ type: 'datetime' })
  updatedAt!: Date;
}
