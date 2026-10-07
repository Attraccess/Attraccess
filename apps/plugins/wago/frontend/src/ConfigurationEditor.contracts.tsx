import type { ConfigurationEditorMetadata } from './api';
import type { WagoConfigurationSnapshot } from './api';
export type Section = 'channels' | 'devices' | 'review' | 'history' | 'diagnostics';

export interface WorkingCopy {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  source: string | null;
}
