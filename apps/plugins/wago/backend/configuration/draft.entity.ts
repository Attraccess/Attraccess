import type { WagoConfigurationDraftRow } from '../storage';

/** Row of the configuration draft table (one draft per controller). */
export type WagoConfigurationDraft = WagoConfigurationDraftRow;

/** A draft that may not be stored yet: it gets its id when it is first saved. */
export type WagoConfigurationDraftInput = Omit<WagoConfigurationDraftRow, 'id'> & { id?: number };
