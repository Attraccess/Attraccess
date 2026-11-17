import { DataSource } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import type { TokenHashService } from '../../../encryption/token-hash.service';
import { isDatabaseBusyError } from '../../persistence-errors';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { SqliteSessionStore } from './sqlite-session-store';

jest.setTimeout(60_000);

const hash = { hashToken: (token: string) => `h:${token}` } as TokenHashService;
const HOUR = 3_600_000;
const inAnHour = () => new Date(Date.now() + HOUR);

/** SQLite specifics of the session store on a real file: a writer of another connection makes it busy. */
describe('SqliteSessionStore across independent connections', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let storeA: SqliteSessionStore;

  const activeTokens = async (): Promise<string[]> =>
    (await first.getRepository(Session).find()).map((session) => session.token).sort();

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    await first.getRepository(User).save({ id: 7, username: 'fixture', email: 'fixture@example.com' });
    storeA = new SqliteSessionStore(first.getRepository(Session), hash);
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(Session).clear();
    await first.query('DELETE FROM sso_logout_state');
  });

  // Rotation, logout receipt and revocation races are part of the SessionStore conformance suite
  // (database/conformance/ports), which runs them on every backend. SQLITE_BUSY handling is SQLite's own.
  describe('a busy database', () => {
    it('surfaces SQLITE_BUSY as the neutral busy category and recovers when the writer is done', async () => {
      await storeA.createSession('h:busy', 7, undefined, inAnHour());
      const impatient = new SqliteSessionStore((await fixture.open(false, 100)).getRepository(Session), hash);

      const writer = first.createQueryRunner();
      await writer.connect();
      await writer.startTransaction();
      await writer.query('DELETE FROM sso_logout_state');
      let failure: unknown;
      try {
        await impatient.revokeSession('busy').catch((error) => {
          failure = error;
        });
      } finally {
        await writer.rollbackTransaction();
        await writer.release();
      }

      expect(isDatabaseBusyError(failure)).toBe(true);
      expect(await activeTokens()).toEqual(['h:busy']);
      expect(await impatient.revokeSession('busy')).toBe(true);
    });
  });
});
