import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import type { HookFailurePolicy, NoScreenPolicy } from '@attraccess/plugins-backend-sdk';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
import { auditActorFields, type AuditActor } from './audit-actor';
import { ReaderUiRegistry } from './reader-ui.registry';
import { READER_UI_SETTINGS_STORE, type ReaderUiSettingsStore } from './reader-ui-settings.port';

export interface ResourceReaderUiSettings {
  noScreenPolicy: NoScreenPolicy | null;
  plugins: { plugin: string; widgetsEnabled: boolean; hookFailurePolicy: HookFailurePolicy }[];
}

/** Host-owned admin settings for the reader UI (ATT-1187 D10). Every change is audited. */
@Injectable()
export class ReaderUiSettingsService {
  constructor(
    @Inject(READER_UI_SETTINGS_STORE) private readonly store: ReaderUiSettingsStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly registry: ReaderUiRegistry,
  ) {}

  async getResource(resourceId: number): Promise<ResourceReaderUiSettings> {
    const [noScreenPolicy, plugins] = await Promise.all([
      this.store.getNoScreenPolicy(resourceId),
      this.store.listPluginSettings(resourceId),
    ]);
    // A plugin has no row until an admin changes it, so loaded plugins are listed with the defaults.
    // Rows of plugins that are not loaded stay stored but are not offered.
    const stored = new Map(plugins.map((p) => [p.plugin, p]));
    return {
      noScreenPolicy,
      plugins: this.registry.pluginNames().map((plugin) => ({
        plugin,
        widgetsEnabled: stored.get(plugin)?.widgetsEnabled ?? true,
        hookFailurePolicy: stored.get(plugin)?.hookFailurePolicy ?? 'fail-closed',
      })),
    };
  }

  async setResource(resourceId: number, next: ResourceReaderUiSettings, actor: AuditActor): Promise<void> {
    const loaded = new Set(this.registry.pluginNames());
    const unknown = next.plugins.filter((entry) => !loaded.has(entry.plugin)).map((entry) => entry.plugin);
    if (unknown.length) throw new BadRequestException(`Unknown plugin: ${unknown.join(', ')}`);
    const before = await this.getResource(resourceId);
    await this.store.setNoScreenPolicy(resourceId, next.noScreenPolicy);
    if (before.noScreenPolicy !== next.noScreenPolicy) {
      await this.log(actor, { setting: 'noScreenPolicy', resourceId, value: next.noScreenPolicy ?? 'default' });
    }
    for (const entry of next.plugins) {
      const prev = before.plugins.find((p) => p.plugin === entry.plugin);
      await this.store.setPluginSetting({ resourceId, ...entry });
      if ((prev?.widgetsEnabled ?? true) !== entry.widgetsEnabled) {
        await this.log(actor, {
          setting: 'widgetsEnabled',
          resourceId,
          plugin: entry.plugin,
          value: entry.widgetsEnabled,
        });
      }
      if ((prev?.hookFailurePolicy ?? 'fail-closed') !== entry.hookFailurePolicy) {
        await this.log(actor, {
          setting: 'hookFailurePolicy',
          resourceId,
          plugin: entry.plugin,
          value: entry.hookFailurePolicy,
        });
      }
    }
  }

  async getReader(readerId: number): Promise<{ widgetsEnabled: boolean }> {
    return { widgetsEnabled: (await this.store.getReaderWidgetsEnabled(readerId)) ?? true };
  }

  async setReader(readerId: number, widgetsEnabled: boolean, actor: AuditActor): Promise<void> {
    await this.store.setReaderWidgetsEnabled(readerId, widgetsEnabled);
    await this.log(actor, { setting: 'readerWidgetsEnabled', readerId, value: widgetsEnabled });
  }

  async noScreenPolicyOverride(resourceId: number): Promise<NoScreenPolicy | null> {
    return this.store.getNoScreenPolicy(resourceId);
  }

  async failurePolicy(resourceId: number, plugin: string): Promise<HookFailurePolicy> {
    return (await this.store.getPluginSetting(resourceId, plugin))?.hookFailurePolicy ?? 'fail-closed';
  }

  /** Widgets show only when both the resource (per plugin) and the reader toggle are on. */
  async widgetsEnabled(resourceId: number, plugin: string, readerId: number): Promise<boolean> {
    const [pluginRow, readerEnabled] = await Promise.all([
      this.store.getPluginSetting(resourceId, plugin),
      this.store.getReaderWidgetsEnabled(readerId),
    ]);
    return (pluginRow?.widgetsEnabled ?? true) && (readerEnabled ?? true);
  }

  /**
   * Widget toggles for one slot sync in two queries: the reader toggle and the (resource, plugin) pairs
   * switched off, as `resourceId|plugin`.
   */
  async widgetToggles(
    readerId: number,
    resourceIds: number[],
  ): Promise<{ readerEnabled: boolean; disabled: Set<string> }> {
    const [readerEnabled, off] = await Promise.all([
      this.store.getReaderWidgetsEnabled(readerId),
      this.store.listDisabledPluginSettings(resourceIds),
    ]);
    return {
      readerEnabled: readerEnabled ?? true,
      disabled: new Set(off.map((row) => `${row.resourceId}|${row.plugin}`)),
    };
  }

  private async log(
    actor: AuditActor,
    details: { setting: string; resourceId?: number; readerId?: number; plugin?: string; value: string | boolean },
  ) {
    const subjectId = details.resourceId ?? details.readerId ?? 0;
    await this.audit.record({
      domain: 'attractap',
      action: 'attractap.ui.setting_changed',
      actor: auditActorFields(actor),
      subject: { type: details.resourceId ? 'resource' : 'attractap.reader', id: subjectId },
      details,
    });
  }
}
