import type { ReaderUiAlertKind, ReaderUiAlertRecord } from '@attraccess/application-models';
import type { NoScreenPolicy } from '@attraccess/plugins-backend-sdk';
import type { ReaderUiAlertScope, ReaderUiAlertStore } from './reader-ui-alerts.port';
import type { ReaderUiPluginSetting, ReaderUiSettingsStore } from './reader-ui-settings.port';

/** In-memory fake of the reader UI alert store for unit tests. `rows` is directly inspectable and seedable. */
export class InMemoryReaderUiAlertStore implements ReaderUiAlertStore {
  readonly rows: ReaderUiAlertRecord[] = [];

  async listOpen(): Promise<ReaderUiAlertRecord[]> {
    return this.rows.filter((row) => row.clearedAt === null);
  }

  async findOpen(id: number): Promise<ReaderUiAlertRecord | null> {
    return this.rows.find((row) => row.id === id && row.clearedAt === null) ?? null;
  }

  async listOpenInScope(kind: ReaderUiAlertKind, scope: ReaderUiAlertScope): Promise<ReaderUiAlertRecord[]> {
    return this.rows.filter(
      (row) =>
        row.clearedAt === null &&
        row.kind === kind &&
        row.plugin === (scope.plugin ?? null) &&
        row.readerId === (scope.readerId ?? null),
    );
  }

  async open(alert: {
    kind: ReaderUiAlertKind;
    message: string;
    plugin: string | null;
    readerId: number | null;
  }): Promise<ReaderUiAlertRecord> {
    const row: ReaderUiAlertRecord = {
      id: this.rows.length + 1,
      createdAt: new Date(),
      clearedAt: null,
      clearedByUserId: null,
      ...alert,
    };
    this.rows.push(row);
    return row;
  }

  async clear(id: number, clearedByUserId: number | null): Promise<ReaderUiAlertRecord> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`alert ${id} not found`);
    row.clearedAt = new Date();
    row.clearedByUserId = clearedByUserId;
    return row;
  }
}

/** In-memory fake of the reader UI settings store for unit tests. */
export class InMemoryReaderUiSettingsStore implements ReaderUiSettingsStore {
  readonly resources = new Map<number, NoScreenPolicy | null>();
  readonly plugins: ReaderUiPluginSetting[] = [];
  readonly readers = new Map<number, boolean>();
  readonly calls = { listDisabled: 0, readerRead: 0 };

  async getNoScreenPolicy(resourceId: number): Promise<NoScreenPolicy | null> {
    return this.resources.get(resourceId) ?? null;
  }

  async listPluginSettings(resourceId: number): Promise<ReaderUiPluginSetting[]> {
    return this.plugins.filter((row) => row.resourceId === resourceId).sort((a, b) => a.plugin.localeCompare(b.plugin));
  }

  async getPluginSetting(resourceId: number, plugin: string): Promise<ReaderUiPluginSetting | null> {
    return this.plugins.find((row) => row.resourceId === resourceId && row.plugin === plugin) ?? null;
  }

  async getReaderWidgetsEnabled(readerId: number): Promise<boolean | null> {
    this.calls.readerRead++;
    return this.readers.get(readerId) ?? null;
  }

  async listDisabledPluginSettings(resourceIds: number[]): Promise<ReaderUiPluginSetting[]> {
    this.calls.listDisabled++;
    return this.plugins.filter((row) => resourceIds.includes(row.resourceId) && !row.widgetsEnabled);
  }

  async setNoScreenPolicy(resourceId: number, policy: NoScreenPolicy | null): Promise<void> {
    this.resources.set(resourceId, policy);
  }

  async setPluginSetting(setting: ReaderUiPluginSetting): Promise<void> {
    const existing = this.plugins.find((row) => row.resourceId === setting.resourceId && row.plugin === setting.plugin);
    if (existing) Object.assign(existing, setting);
    else this.plugins.push({ ...setting });
  }

  async setReaderWidgetsEnabled(readerId: number, widgetsEnabled: boolean): Promise<void> {
    this.readers.set(readerId, widgetsEnabled);
  }
}
