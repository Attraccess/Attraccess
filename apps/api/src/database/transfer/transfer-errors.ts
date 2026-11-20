import { UPGRADE_DOCS_URL } from '../backend/database-type';

/**
 * What a failed transfer left behind. Every failure happens before the import commits, so the SQLite file is always
 * untouched and PostgreSQL never holds imported rows.
 * - `rolled-back`: nothing of the transfer is left in PostgreSQL.
 * - `plugin-storage-kept`: the import rolled back, but the (empty) storage tables of installed plugins were prepared
 *   before it in their own transactions and stay; a retry reuses them.
 * - `refused`: the transfer did not start; nothing was changed.
 */
export type TransferFailureOutcome = 'rolled-back' | 'plugin-storage-kept' | 'refused';

/** Who reads the error: the API retries on its next start, the `transfer-sqlite` command is run again by hand. */
export type TransferRunner = 'startup' | 'command';

const OUTCOMES: Record<TransferFailureOutcome, string> = {
  'rolled-back': 'The SQLite file is untouched and the PostgreSQL database holds no partial import',
  'plugin-storage-kept':
    'The SQLite file is untouched and no data was imported into PostgreSQL; the empty storage tables of installed ' +
    'plugins may already exist there and are reused when the transfer runs again',
  refused: 'Nothing was changed: neither the SQLite file nor the PostgreSQL database',
};

const RETRY: Record<TransferRunner, string> = {
  startup: '; the next start retries',
  command: '; run the command again once the cause is fixed',
};

/** The SQLite -> PostgreSQL transfer failed before the import committed. The SQLite file is untouched. */
export class SqliteTransferError extends Error {
  readonly outcome: TransferFailureOutcome;

  constructor(
    readonly step: string,
    readonly detail: string,
    options: { cause?: unknown; outcome?: TransferFailureOutcome } = {},
  ) {
    const outcome = options.outcome ?? 'rolled-back';
    super(describeFailure(step, detail, outcome, 'startup'), { cause: options.cause });
    this.outcome = outcome;
    this.name = 'SqliteTransferError';
  }

  /** The message for the runner: `message` is the startup wording, the command gets its own. */
  describe(runner: TransferRunner): string {
    return describeFailure(this.step, this.detail, this.outcome, runner);
  }
}

function describeFailure(
  step: string,
  detail: string,
  outcome: TransferFailureOutcome,
  runner: TransferRunner,
): string {
  const retry = outcome === 'refused' ? '' : RETRY[runner];
  return (
    `Transferring the SQLite data to PostgreSQL failed while ${step}: ${detail}. ${OUTCOMES[outcome]}${retry}. ` +
    `See ${UPGRADE_DOCS_URL}.`
  );
}

/** Only the class and message are safe to show: driver errors can quote row values. */
export function safeDetail(error: unknown): string {
  if (error instanceof Error) return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
  return 'unknown error';
}
