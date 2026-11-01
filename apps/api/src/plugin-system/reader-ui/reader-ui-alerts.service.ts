import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ReaderUiAlert, ReaderUiAlertKind } from '@attraccess/database-entities';
import { AuditService } from '../../audit/audit.service';
import { auditActorFields, type AuditActor } from './audit-actor';
import { MetricsService } from '../../metrics/metrics.service';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';

const KINDS: ReaderUiAlertKind[] = ['breaker-open', 'load-failure', 'crash-loop'];

/** Host-owned admin alerts for the reader UI (ATT-1187 D9). */
@Injectable()
export class ReaderUiAlertsService implements OnModuleInit {
  private readonly logger = new Logger(ReaderUiAlertsService.name);
  /** Hot-path lookup for crash-loop suspension; mirrors the open crash-loop rows. */
  private readonly suspendedReaders = new Map<number, number>();
  private readonly suspendTimers = new Map<number, NodeJS.Timeout>();
  private readonly listeners = new Set<(alert: ReaderUiAlert) => void>();

  constructor(
    @InjectRepository(ReaderUiAlert) private readonly repository: Repository<ReaderUiAlert>,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const open = await this.listOpen();
      for (const alert of open) {
        if (alert.kind === 'crash-loop' && alert.readerId) this.suspend(alert.readerId);
      }
      await this.refreshGauge();
    } catch (error) {
      this.logger.warn(`Could not load reader UI alerts: ${(error as Error).message}`);
    }
  }

  onCleared(listener: (alert: ReaderUiAlert) => void): void {
    this.listeners.add(listener);
  }

  listOpen(): Promise<ReaderUiAlert[]> {
    return this.repository.find({ where: { clearedAt: IsNull() }, order: { createdAt: 'DESC' } });
  }

  async raise(
    kind: ReaderUiAlertKind,
    message: string,
    scope: { plugin?: string; readerId?: number },
  ): Promise<ReaderUiAlert> {
    const existing = await this.repository.findOne({
      where: { kind, plugin: scope.plugin ?? IsNull(), readerId: scope.readerId ?? IsNull(), clearedAt: IsNull() },
    });
    if (existing) return existing;
    const alert = await this.repository.save(
      this.repository.create({
        kind,
        message: message.slice(0, 300),
        plugin: scope.plugin ?? null,
        readerId: scope.readerId ?? null,
      }),
    );
    if (kind === 'crash-loop' && scope.readerId) this.suspend(scope.readerId);
    await this.record(alert, 'created', undefined);
    await this.refreshGauge();
    return alert;
  }

  findOpen(id: number): Promise<ReaderUiAlert | null> {
    return this.repository.findOne({ where: { id, clearedAt: IsNull() } });
  }

  /** `actor` is the admin who cleared it; none when the host clears it itself (e.g. a breaker closed). */
  async clear(id: number, actor: AuditActor | undefined): Promise<ReaderUiAlert | null> {
    const alert = await this.findOpen(id);
    if (!alert) return null;
    alert.clearedAt = new Date();
    alert.clearedByUserId = actor?.id ?? null;
    await this.repository.save(alert);
    if (alert.kind === 'crash-loop' && alert.readerId) this.unsuspend(alert.readerId);
    await this.record(alert, 'cleared', actor);
    await this.refreshGauge();
    this.listeners.forEach((listener) => listener(alert));
    return alert;
  }

  /** Clears every open alert matching a scope, e.g. when a breaker closes by itself. */
  async clearWhere(kind: ReaderUiAlertKind, scope: { plugin?: string; readerId?: number }): Promise<void> {
    const open = await this.repository.find({
      where: { kind, plugin: scope.plugin ?? IsNull(), readerId: scope.readerId ?? IsNull(), clearedAt: IsNull() },
    });
    for (const alert of open) await this.clear(alert.id, undefined);
  }

  /** Crash-loop suspension lapses after 30 minutes without another panic, or when an admin clears the alert. */
  isReaderSuspended(readerId: number): boolean {
    const at = this.suspendedReaders.get(readerId);
    if (at === undefined) return false;
    if (Date.now() - at < READER_UI_TIMING.crashLoopSuspendMs) return true;
    void this.clearWhere('crash-loop', { readerId }).catch(() => undefined);
    this.unsuspend(readerId);
    return false;
  }

  /** Another panic-class reset while suspended restarts the 30 minute window. */
  touchCrash(readerId: number): void {
    if (this.suspendedReaders.has(readerId)) this.suspend(readerId);
  }

  private suspend(readerId: number): void {
    this.suspendedReaders.set(readerId, Date.now());
    const previous = this.suspendTimers.get(readerId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => this.isReaderSuspended(readerId), READER_UI_TIMING.crashLoopSuspendMs + 1000);
    timer.unref?.();
    this.suspendTimers.set(readerId, timer);
  }

  private unsuspend(readerId: number): void {
    this.suspendedReaders.delete(readerId);
    const timer = this.suspendTimers.get(readerId);
    if (timer) clearTimeout(timer);
    this.suspendTimers.delete(readerId);
  }

  private async refreshGauge(): Promise<void> {
    const open = await this.listOpen();
    for (const kind of KINDS) {
      this.metrics.readerUiOpenAlerts.set({ kind }, open.filter((alert) => alert.kind === kind).length);
    }
  }

  private async record(alert: ReaderUiAlert, state: 'created' | 'cleared', actor: AuditActor | undefined) {
    await this.audit
      .recordAttractap({
        action: 'ui.alert_changed',
        subjectType: 'attractap.ui-alert',
        ...(actor ? auditActorFields(actor) : { actorId: null, authenticationMethod: null }),
        subjectId: alert.id,
        details: {
          kind: alert.kind,
          state,
          ...(alert.plugin ? { plugin: alert.plugin } : {}),
          ...(alert.readerId ? { readerId: alert.readerId } : {}),
        },
      })
      .catch(() => undefined);
  }
}
