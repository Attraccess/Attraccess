import { UPGRADE_DOCS_URL } from '../backend/database-type';

/** The SQLite -> PostgreSQL transfer failed. Nothing was imported and the SQLite file is untouched. */
export class SqliteTransferError extends Error {
  constructor(
    readonly step: string,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Transferring the SQLite data to PostgreSQL failed while ${step}: ${detail}. The SQLite file is untouched and ` +
        `the PostgreSQL database holds no partial import; the next start retries. See ${UPGRADE_DOCS_URL}.`,
      options,
    );
    this.name = 'SqliteTransferError';
  }
}

/** Only the class and message are safe to show: driver errors can quote row values. */
export function safeDetail(error: unknown): string {
  if (error instanceof Error) return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
  return 'unknown error';
}
