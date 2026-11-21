import { Client } from 'pg';
import { sslOption, type PostgresConfig } from './postgres-config';

/** Applying the core migrations: two instances that start together must not run the same migration twice. */
export const POSTGRES_MIGRATION_LOCK_KEY = 584_585;

export interface AdvisoryLock {
  release(): Promise<void>;
}

/**
 * Takes a session level advisory lock on a connection of its own and waits for it. Two instances that start at the
 * same time queue here: the second runs after the first finished and then sees its result. The lock ends with the
 * connection, so a crashed holder never blocks the next start.
 */
export async function acquireAdvisoryLock(
  config: Pick<PostgresConfig, 'url' | 'ssl'>,
  key: number,
  /** Called once when another session holds the lock and this one starts waiting. */
  onWait: () => void = () => undefined,
): Promise<AdvisoryLock> {
  const client = new Client({
    connectionString: config.url,
    ssl: sslOption(config.ssl),
    application_name: 'attraccess-startup-lock',
  });
  // An idle connection error must not become an unhandled event; the lock is lost with it, the caller's work fails on
  // its own connection in that case.
  client.on('error', () => undefined);
  await client.connect();
  try {
    const [{ locked }] = (await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key])).rows;
    if (!locked) {
      onWait();
      await client.query('SELECT pg_advisory_lock($1)', [key]);
    }
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
  return {
    async release() {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}
