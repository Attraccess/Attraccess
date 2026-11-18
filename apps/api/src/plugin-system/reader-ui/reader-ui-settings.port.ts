import type { HookFailurePolicy, NoScreenPolicy } from '@attraccess/plugins-backend-sdk';

/** Per (resource, plugin) widget toggle and hook failure policy. */
export interface ReaderUiPluginSetting {
  resourceId: number;
  plugin: string;
  widgetsEnabled: boolean;
  hookFailurePolicy: HookFailurePolicy;
}

/** DI token of the reader UI settings store. */
export const READER_UI_SETTINGS_STORE = Symbol.for('attraccess.reader-ui.settings-store');

/**
 * Host-owned reader UI settings: the no-screen policy override per resource, the widget toggle and failure policy per
 * (resource, plugin) and the widget toggle per reader. A missing row means "use the default".
 */
export interface ReaderUiSettingsStore {
  /** The resource's no-screen policy override; null when none is stored. */
  getNoScreenPolicy(resourceId: number): Promise<NoScreenPolicy | null>;
  /** All plugin settings of a resource, ordered by plugin name. */
  listPluginSettings(resourceId: number): Promise<ReaderUiPluginSetting[]>;
  getPluginSetting(resourceId: number, plugin: string): Promise<ReaderUiPluginSetting | null>;
  /** The reader's widget toggle; null when none is stored. */
  getReaderWidgetsEnabled(readerId: number): Promise<boolean | null>;
  /** The settings of these resources whose widgets are switched off. */
  listDisabledPluginSettings(resourceIds: number[]): Promise<ReaderUiPluginSetting[]>;
  setNoScreenPolicy(resourceId: number, policy: NoScreenPolicy | null): Promise<void>;
  setPluginSetting(setting: ReaderUiPluginSetting): Promise<void>;
  setReaderWidgetsEnabled(readerId: number, widgetsEnabled: boolean): Promise<void>;
}
