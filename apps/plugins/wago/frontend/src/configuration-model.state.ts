import type { WagoConfigurationSnapshot } from './api';
import type { ConfigurationEditorMetadata } from './api';

export const emptyConfiguration: WagoConfigurationSnapshot = { version: 1, physicalPoints: [], logicalChannels: [] };

export const emptyMetadata: ConfigurationEditorMetadata = { names: {}, presets: [] };
