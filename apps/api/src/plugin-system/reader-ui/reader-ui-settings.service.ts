import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReaderUiPluginSettings,
  ReaderUiReaderSettings,
  ReaderUiResourceSettings,
} from '@attraccess/database-entities';
import type { HookFailurePolicy, NoScreenPolicy } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../../audit/audit.service';
import { ReaderUiRegistry } from './reader-ui.registry';

export interface ResourceReaderUiSettings {
  noScreenPolicy: NoScreenPolicy | null;
  plugins: { plugin: string; widgetsEnabled: boolean; hookFailurePolicy: HookFailurePolicy }[];
}

/** Host-owned admin settings for the reader UI (ATT-1187 D10). Every change is audited. */
@Injectable()
export class ReaderUiSettingsService {
  constructor(
    @InjectRepository(ReaderUiResourceSettings) private readonly resources: Repository<ReaderUiResourceSettings>,
    @InjectRepository(ReaderUiPluginSettings) private readonly plugins: Repository<ReaderUiPluginSettings>,
    @InjectRepository(ReaderUiReaderSettings) private readonly readers: Repository<ReaderUiReaderSettings>,
    private readonly audit: AuditService,
    private readonly registry: ReaderUiRegistry,
  ) {}

  async getResource(resourceId: number): Promise<ResourceReaderUiSettings> {
    const [row, plugins] = await Promise.all([
      this.resources.findOne({ where: { resourceId } }),
      this.plugins.find({ where: { resourceId }, order: { plugin: 'ASC' } }),
    ]);
    // A plugin has no row until an admin changes it, so loaded plugins are listed with the defaults.
    // Rows of plugins that are not loaded stay stored but are not offered.
    const stored = new Map(plugins.map((p) => [p.plugin, p]));
    return {
      noScreenPolicy: row?.noScreenPolicy ?? null,
      plugins: this.registry.pluginNames().map((plugin) => ({
        plugin,
        widgetsEnabled: stored.get(plugin)?.widgetsEnabled ?? true,
        hookFailurePolicy: stored.get(plugin)?.hookFailurePolicy ?? 'fail-closed',
      })),
    };
  }

  async setResource(resourceId: number, next: ResourceReaderUiSettings, actorId: number): Promise<void> {
    const loaded = new Set(this.registry.pluginNames());
    const unknown = next.plugins.filter((entry) => !loaded.has(entry.plugin)).map((entry) => entry.plugin);
    if (unknown.length) throw new BadRequestException(`Unknown plugin: ${unknown.join(', ')}`);
    const before = await this.getResource(resourceId);
    await this.resources.save({ resourceId, noScreenPolicy: next.noScreenPolicy });
    if (before.noScreenPolicy !== next.noScreenPolicy) {
      await this.log(actorId, { setting: 'noScreenPolicy', resourceId, value: next.noScreenPolicy ?? 'default' });
    }
    for (const entry of next.plugins) {
      const prev = before.plugins.find((p) => p.plugin === entry.plugin);
      await this.plugins.save({ resourceId, ...entry });
      if ((prev?.widgetsEnabled ?? true) !== entry.widgetsEnabled) {
        await this.log(actorId, {
          setting: 'widgetsEnabled',
          resourceId,
          plugin: entry.plugin,
          value: entry.widgetsEnabled,
        });
      }
      if ((prev?.hookFailurePolicy ?? 'fail-closed') !== entry.hookFailurePolicy) {
        await this.log(actorId, {
          setting: 'hookFailurePolicy',
          resourceId,
          plugin: entry.plugin,
          value: entry.hookFailurePolicy,
        });
      }
    }
  }

  async getReader(readerId: number): Promise<{ widgetsEnabled: boolean }> {
    const row = await this.readers.findOne({ where: { readerId } });
    return { widgetsEnabled: row?.widgetsEnabled ?? true };
  }

  async setReader(readerId: number, widgetsEnabled: boolean, actorId: number): Promise<void> {
    await this.readers.save({ readerId, widgetsEnabled });
    await this.log(actorId, { setting: 'readerWidgetsEnabled', readerId, value: widgetsEnabled });
  }

  async noScreenPolicyOverride(resourceId: number): Promise<NoScreenPolicy | null> {
    return (await this.resources.findOne({ where: { resourceId } }))?.noScreenPolicy ?? null;
  }

  async failurePolicy(resourceId: number, plugin: string): Promise<HookFailurePolicy> {
    return (await this.plugins.findOne({ where: { resourceId, plugin } }))?.hookFailurePolicy ?? 'fail-closed';
  }

  /** Widgets show only when both the resource (per plugin) and the reader toggle are on. */
  async widgetsEnabled(resourceId: number, plugin: string, readerId: number): Promise<boolean> {
    const [pluginRow, readerRow] = await Promise.all([
      this.plugins.findOne({ where: { resourceId, plugin } }),
      this.readers.findOne({ where: { readerId } }),
    ]);
    return (pluginRow?.widgetsEnabled ?? true) && (readerRow?.widgetsEnabled ?? true);
  }

  private async log(
    actorId: number,
    details: { setting: string; resourceId?: number; readerId?: number; plugin?: string; value: string | boolean },
  ) {
    const subjectId = details.resourceId ?? details.readerId ?? 0;
    await this.audit
      .recordAttractap({
        action: 'ui.setting_changed',
        subjectType: details.resourceId ? 'resource' : 'attractap.reader',
        actorId,
        authenticationMethod: 'session',
        subjectId,
        details,
      })
      .catch(() => undefined);
  }
}
