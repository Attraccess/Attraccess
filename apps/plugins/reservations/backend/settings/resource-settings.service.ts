import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { tablesOf } from '../storage';
import type { ResourceSettingsRow } from '../storage/resource-settings-table';
import { BookableHours, normalizeBookableHours } from '../time/bookable-hours';
import {
  ResourceSettings,
  ResourceSettingsValues,
  defaultSettings,
  finalizeSettings,
  mergeSettings,
  settingsValues,
  validateSettings,
} from './settings.model';
import { ReservationError } from '../reservations/errors';

function fromRow(row: ResourceSettingsRow): ResourceSettings {
  let bookableHours: BookableHours;
  try {
    bookableHours = normalizeBookableHours(JSON.parse(row.bookableHours || '{}') as BookableHours);
  } catch {
    bookableHours = {};
  }
  return {
    resourceId: row.resourceId,
    enabled: Boolean(row.enabled),
    approvalRequired: Boolean(row.approvalRequired),
    timeStepMinutes: row.timeStepMinutes,
    minDurationMinutes: row.minDurationMinutes,
    maxDurationMinutes: row.maxDurationMinutes,
    maxAdvanceDays: row.maxAdvanceDays,
    minLeadMinutes: row.minLeadMinutes,
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    maxActiveBookingsPerUser: row.maxActiveBookingsPerUser,
    whoCanBook: row.whoCanBook,
    confirmWindowMinutes: row.confirmWindowMinutes,
    checkInEnabled: Boolean(row.checkInEnabled),
    checkInGraceMinutes: row.checkInGraceMinutes,
    earlyCheckInMinutes: row.earlyCheckInMinutes,
    handoverReminderMinutes: row.handoverReminderMinutes,
    bookableHours,
  };
}

/**
 * Per-resource settings with an in-process cache. The cache is warmed on boot with one load-all query
 * and kept current by `update()`; after warm-up `getCachedSettings` never touches the database, so the
 * pre-start hook can call it on every start. Single API instance assumed (cross-instance
 * invalidation: ATT-1146).
 */
@Injectable()
export class ResourceSettingsService implements OnModuleInit {
  private readonly logger = new Logger('ReservationsSettings');
  private readonly cache = new Map<number, ResourceSettings>();
  private warmed: Promise<void> | null = null;
  private warm = false;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get rows() {
    return tablesOf(this.context).resourceSettings;
  }

  async onModuleInit(): Promise<void> {
    await this.warmUp().catch((error) => this.logger.error(`settings cache warm-up failed: ${String(error)}`));
  }

  /** Loads every settings row into the cache (idempotent; concurrent calls share one load). */
  warmUp(): Promise<void> {
    // A failed load is not cached: the next caller (e.g. the pre-start hook) retries.
    this.warmed ??= this.loadAll().then(
      () => {
        this.warm = true;
      },
      (error) => {
        this.warmed = null;
        throw error;
      },
    );
    return this.warmed;
  }

  get isWarm(): boolean {
    return this.warm;
  }

  /** Resolves once the cache is warm. */
  whenReady(): Promise<void> {
    return this.warmUp();
  }

  private async loadAll(): Promise<void> {
    const rows = (await this.rows.find()) as ResourceSettingsRow[];
    this.cache.clear();
    for (const row of rows) this.cache.set(row.resourceId, fromRow(row));
  }

  /**
   * Synchronous, database-free accessor for the pre-start hook. Resources without a row (and every
   * resource before warm-up finished) report the defaults, i.e. `enabled: false`.
   */
  getCachedSettings(resourceId: number): ResourceSettings {
    return this.cache.get(resourceId) ?? defaultSettings(resourceId);
  }

  /** Ids of all resources with reservations enabled (from the cache). */
  getEnabledResourceIds(): number[] {
    return [...this.cache.values()].filter((settings) => settings.enabled).map((settings) => settings.resourceId);
  }

  /** Authoritative read from the database (defaults when no row exists). */
  async get(resourceId: number): Promise<ResourceSettings> {
    const row = (await this.rows.get(resourceId)) as ResourceSettingsRow | null;
    return row ? fromRow(row) : defaultSettings(resourceId);
  }

  /** Validates, persists and refreshes the cache. Throws a 400 `INVALID_SETTINGS` on invalid input. */
  async update(
    resourceId: number,
    patch: Partial<ResourceSettingsValues>,
  ): Promise<{ before: ResourceSettings; after: ResourceSettings }> {
    const before = await this.get(resourceId);
    // Validate the raw input first: normalizing assumes a well-formed structure and would otherwise
    // crash on it (500) or silently drop unknown weekdays.
    const requested = mergeSettings(settingsValues(before), patch);
    const errors = validateSettings(requested);
    if (errors.length > 0) {
      throw new ReservationError('INVALID_SETTINGS', 'Invalid reservation settings', { errors });
    }
    const merged = finalizeSettings(requested);
    await this.rows.upsert(
      { ...merged, resourceId, bookableHours: JSON.stringify(merged.bookableHours), updatedAt: new Date() },
      { conflictOn: ['resourceId'] },
    );
    const after: ResourceSettings = { resourceId, ...merged };
    this.cache.set(resourceId, after);
    return { before, after };
  }

  /** Test/ops hook: drop a resource from the cache so the next read falls back to the defaults. */
  invalidate(resourceId: number): void {
    this.cache.delete(resourceId);
  }
}
