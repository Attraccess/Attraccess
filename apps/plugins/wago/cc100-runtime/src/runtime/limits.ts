/** Messages above these sizes are dropped by the transport before they are decoded. */
export const MAX_COMMAND_BYTES = 64 * 1024;
export const MAX_CLAIM_BYTES = 64 * 1024;
export const MAX_ROTATION_BYTES = 64 * 1024;
export const MAX_DESIRED_BYTES = 1024 * 1024;

/** Largest rejection report: error count and encoded size. */
export const MAX_REPORT_ERRORS = 50;
export const MAX_REPORT_BYTES = 64 * 1024;

/** Budget for readiness errors in the status message, and for fault text. */
export const MAX_READINESS_ERROR_BYTES = 8 * 1024;
export const MAX_FAULT_TEXT_BYTES = 1024;
