import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PreStartHook, ReaderUiProvider, SessionEndHook } from '@attraccess/plugins-backend-sdk';
import { ReaderUiAlertsService } from './reader-ui-alerts.service';

export interface ReaderUiPluginEntry {
  readerUi?: ReaderUiProvider;
  preStartHook?: PreStartHook;
  sessionEndHook?: SessionEndHook;
}

export interface ReaderUiInvalidation {
  pluginName: string;
  scope: { resourceId?: number; readerId?: number };
}

export const READER_UI_INVALIDATE_EVENT = 'reader-ui.invalidate';

/** Collects plugin reader UI providers and access hooks at load time. Plugin order is the host order. */
@Injectable()
export class ReaderUiRegistry {
  private readonly logger = new Logger(ReaderUiRegistry.name);
  private readonly entries = new Map<string, ReaderUiPluginEntry>();

  constructor(
    private readonly events: EventEmitter2,
    private readonly alerts: ReaderUiAlertsService,
  ) {}

  register(pluginName: string, entry: ReaderUiPluginEntry): void {
    this.entries.set(pluginName, entry);
    void this.alerts.clearWhere('load-failure', { plugin: pluginName }).catch(() => undefined);
  }

  unregister(pluginName: string): void {
    this.entries.delete(pluginName);
  }

  /** Re-evaluate and push contributions for the scope. Extra permission checks live in the guarded context. */
  invalidate(pluginName: string, scope: { resourceId?: number; readerId?: number }): void {
    const event: ReaderUiInvalidation = { pluginName, scope };
    this.events.emit(READER_UI_INVALIDATE_EVENT, event);
  }

  /** A plugin with ACCESS_HOOKS that fails to load leaves its hooks unenforced, so admins must see it. */
  reportLoadFailure(pluginName: string, hasAccessHooks: boolean, error: unknown): void {
    this.logger.error(`Plugin ${pluginName} failed to load: ${(error as Error)?.message ?? String(error)}`);
    if (!hasAccessHooks) return;
    void this.alerts
      .raise('load-failure', `Plugin ${pluginName} has access hooks but failed to load`, { plugin: pluginName })
      .catch((e) => this.logger.error(`Could not raise load-failure alert: ${(e as Error).message}`));
  }

  /** Every loaded plugin that contributes reader UI or hooks, in host order. */
  pluginNames(): string[] {
    return [...this.entries.keys()].sort((a, b) => a.localeCompare(b));
  }

  providers(): { plugin: string; provider: ReaderUiProvider }[] {
    return [...this.entries]
      .filter(([, entry]) => entry.readerUi)
      .map(([plugin, entry]) => ({ plugin, provider: entry.readerUi as ReaderUiProvider }))
      .sort((a, b) => a.plugin.localeCompare(b.plugin));
  }

  preStartHooks(): { plugin: string; hook: PreStartHook }[] {
    return [...this.entries]
      .filter(([, entry]) => entry.preStartHook)
      .map(([plugin, entry]) => ({ plugin, hook: entry.preStartHook as PreStartHook }))
      .sort((a, b) => a.plugin.localeCompare(b.plugin));
  }

  sessionEndHooks(): { plugin: string; hook: SessionEndHook }[] {
    return [...this.entries]
      .filter(([, entry]) => entry.sessionEndHook)
      .map(([plugin, entry]) => ({ plugin, hook: entry.sessionEndHook as SessionEndHook }))
      .sort((a, b) => a.plugin.localeCompare(b.plugin));
  }
}
