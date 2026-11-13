import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MatterConnectionService } from '../connection/connection.service';
import { MatterFabricService } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { MatterBackupService } from './backup.service';

export type SchedulerTiming = {
  /** How old the newest backup may get before the daily one is due. */
  intervalMs: number;
  /** How often the schedule is checked while connected. */
  checkMs: number;
  /** Quiet period after a `fabric.changed` before its backup runs, so a burst makes one. */
  debounceMs: number;
};
export const DEFAULT_TIMING: SchedulerTiming = { intervalMs: 24 * 3_600_000, checkMs: 15 * 60_000, debounceMs: 30_000 };
export const SCHEDULER_TIMING = Symbol.for('attraccess.matter.backup-timing');

/**
 * The plugin's own backup schedule: no host job. Runs only while the sidecar is connected and a fabric exists, and
 * never in recovery. Backups also follow a fabric generation that moved on (debounced).
 */
@Injectable()
export class MatterBackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: (() => void)[] = [];
  private checkTimer: NodeJS.Timeout | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly timing: SchedulerTiming;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(MatterFabricService) private readonly fabric: MatterFabricService,
    @Inject(MatterBackupService) private readonly backups: MatterBackupService,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Optional() @Inject(SCHEDULER_TIMING) timing: Partial<SchedulerTiming> = {},
  ) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
  }

  private get connection() {
    return this.connectionService.connection;
  }

  onModuleInit(): void {
    this.unsubscribe.push(
      this.connection.onStateChange((status) => {
        if (status.state === 'connected') this.start();
        else this.stop();
      }),
      this.fabric.onAdvanced(() => this.scheduleAfterChange()),
      this.backups.onSucceeded((trigger) => {
        if (trigger !== 'pre_restore') this.safely(() => this.refreshNext());
      }),
    );
    if (this.connection.status().state === 'connected') this.start();
  }

  onModuleDestroy(): void {
    for (const stop of this.unsubscribe.splice(0)) stop();
    this.stop();
    clearTimeout(this.debounceTimer);
  }

  private start(): void {
    this.stop();
    this.safely(() => this.tick());
    this.checkTimer = setInterval(() => this.safely(() => this.tick()), this.timing.checkMs);
    this.checkTimer.unref();
  }

  /** Background work must never leave an unhandled rejection, for example when the database closes meanwhile. */
  private safely(work: () => Promise<void>): void {
    work().catch(() => this.context.logger.warn?.('A scheduled Matter backup check failed.'));
  }

  private stop(): void {
    clearInterval(this.checkTimer);
    this.checkTimer = undefined;
    this.backups.setNextScheduledAt(null);
  }

  /** Takes the scheduled backup when it is due. Public so the schedule can be driven without waiting. */
  async tick(): Promise<void> {
    if (this.connection.status().state !== 'connected') return;
    // Settle the mismatch question first: a backup in recovery would only fail.
    const mismatch = await this.fabric.detect('connect');
    if (mismatch !== null) return this.backups.setNextScheduledAt(null);
    if (!(await this.fabricExists())) return this.backups.setNextScheduledAt(null);
    const latest = (await this.backups.summary()).lastSuccessfulAt;
    const dueAt = latest ? new Date(latest).getTime() + this.timing.intervalMs : Date.now();
    this.backups.setNextScheduledAt(new Date(Math.max(dueAt, Date.now())).toISOString());
    if (Date.now() < dueAt) return;
    await this.backups.backup('daily').catch(() => undefined);
    const after = (await this.backups.summary()).lastSuccessfulAt;
    this.backups.setNextScheduledAt(
      new Date((after ? new Date(after).getTime() : Date.now()) + this.timing.intervalMs).toISOString(),
    );
  }

  /** The next run is one interval after the newest backup; shown right after a backup, not only after the next check. */
  private async refreshNext(): Promise<void> {
    if (this.checkTimer === undefined || this.guard.recoveryRequired) return;
    const latest = (await this.backups.summary()).lastSuccessfulAt;
    // The connection may have gone away while the summary was read.
    if (this.checkTimer === undefined) return;
    this.backups.setNextScheduledAt(
      latest ? new Date(new Date(latest).getTime() + this.timing.intervalMs).toISOString() : null,
    );
  }

  private async fabricExists(): Promise<boolean> {
    const status = await this.fabric.status();
    return status.sidecar.state === 'initialized' && status.recorded !== null && status.recoveryKey.present;
  }

  private scheduleAfterChange(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.safely(() => this.backupAfterChange()), this.timing.debounceMs);
    this.debounceTimer.unref();
  }

  /** Only when the generation really moved past what the newest backup holds. */
  async backupAfterChange(): Promise<void> {
    if (this.guard.recoveryRequired || this.connection.status().state !== 'connected') return;
    const status = await this.fabric.status();
    const generation = status.recorded?.fabricGeneration;
    if (generation === undefined || !status.recoveryKey.present) return;
    const latest = status.backups.stored[0]?.fabricGeneration ?? -1;
    if (generation <= latest) return;
    await this.backups.backup('fabric_changed').catch(() => undefined);
  }
}
