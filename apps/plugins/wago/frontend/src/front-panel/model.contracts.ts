import type { WagoConfigurationSnapshot } from '../api';
import type { ConfigurationEditorMetadata } from '../api';
import { DIGITAL_TERMINALS } from '../../../backend/configuration-digital';

export type Channel = WagoConfigurationSnapshot['logicalChannels'][number];

export interface PanelConfiguration {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
}

export type Terminal = (typeof DIGITAL_TERMINALS)[number];
