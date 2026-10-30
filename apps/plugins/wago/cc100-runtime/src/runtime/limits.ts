import { MAX_CONFIGURATION_BYTES, STATUS_ERROR_BUDGET_BYTES } from '../../../shared/configuration-limits';

/** Messages above these sizes are dropped by the transport before they are decoded. */
export const MAX_COMMAND_BYTES = 64 * 1024;
export const MAX_CLAIM_BYTES = 64 * 1024;
export const MAX_ROTATION_BYTES = 64 * 1024;
/** The editor refuses configurations above the same size, so it never publishes one the runtime drops. */
export const MAX_DESIRED_BYTES = MAX_CONFIGURATION_BYTES;

/** Largest rejection report: error count and encoded size. */
export const MAX_REPORT_ERRORS = 50;
export const MAX_REPORT_BYTES = 64 * 1024;

/** Budget for readiness errors in the status message, and for fault text. */
// Shared, because the editor's worst-case status report check assumes exactly this readiness budget.
export const MAX_READINESS_ERROR_BYTES = STATUS_ERROR_BUDGET_BYTES;
export const MAX_FAULT_TEXT_BYTES = 1024;
