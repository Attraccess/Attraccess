import type { WagoConfigurationRevisionRow } from '../domain-storage';

export type WagoConfigurationRevisionState = 'pending' | 'published' | 'applied' | 'rejected';

/** Row of the configuration revision table; `state` is always a {@link WagoConfigurationRevisionState}. */
export type WagoConfigurationRevision = WagoConfigurationRevisionRow;
