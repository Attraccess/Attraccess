import type { ErrorKeyOf } from '../useMatterErrorText';

/** The fabric & backup section looks a code up under `fabric.error.<code>` before the shared `error.<code>`. */
export const fabricErrorKey: ErrorKeyOf = (code) => `fabric.error.${code}`;

/** "Back up now" reports the reasons of the backup status table; the backend sends `busy` for `sidecar_busy`. */
export const backupReasonKey: ErrorKeyOf = (code) => `fabric.backups.reason.${code === 'busy' ? 'sidecar_busy' : code}`;
