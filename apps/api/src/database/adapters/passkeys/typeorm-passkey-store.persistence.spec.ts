import { DataSource } from 'typeorm';
import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import type { NewPasskey } from '@attraccess/application-models';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { TypeOrmPasskeyStore } from './typeorm-passkey-store';

jest.setTimeout(60_000);

const storeOn = (source: DataSource) =>
  new TypeOrmPasskeyStore(
    source.getRepository(Passkey),
    source.getRepository(PasskeyChallenge),
    source.getRepository(User),
  );

const newPasskey = (overrides: Partial<NewPasskey> = {}): NewPasskey => ({
  userId: 7,
  credentialId: 'cred-1',
  publicKey: 'pk',
  counter: 0,
  transports: 'internal,hybrid',
  name: 'Laptop',
  backedUp: false,
  ...overrides,
});

describe('TypeOrmPasskeyStore on real SQLite', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let storeA: TypeOrmPasskeyStore;
  let storeB: TypeOrmPasskeyStore;

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    const second = await fixture.open();
    await first.getRepository(User).save([
      { id: 7, username: 'maker', email: 'maker@example.com', isEmailVerified: true },
      { id: 8, username: 'other', email: 'other@example.com', isEmailVerified: true },
    ]);
    storeA = storeOn(first);
    storeB = storeOn(second);
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(Passkey).clear();
    await first.getRepository(PasskeyChallenge).clear();
  });

  describe('challenge consumption', () => {
    // Single consumption across connections and the neutral challenge values are part of the PasskeyStore
    // conformance suite (database/conformance/ports).
    it('sweeps expired challenges when a new one is issued', async () => {
      await first
        .getRepository(PasskeyChallenge)
        .insert({ challenge: 'stale', userId: null, expiresAt: new Date(Date.now() - 1000) });

      await storeA.issueChallenge({ challenge: 'fresh', userId: null, expiresAt: new Date(Date.now() + 60_000) });

      expect((await first.getRepository(PasskeyChallenge).find()).map((row) => row.challenge)).toEqual(['fresh']);
    });
  });

  describe('passkeys', () => {
    it('registers, finds by credential id and records a sign-in', async () => {
      const registered = await storeA.register(newPasskey());
      expect(registered).toMatchObject({ userId: 7, credentialId: 'cred-1', counter: 0, backedUp: false });
      expect(registered.lastUsedAt).toBeNull();

      const usedAt = new Date();
      await storeB.recordUse(registered.id, { counter: 5, backedUp: true, usedAt });

      expect(await storeA.findByCredentialId('cred-1')).toMatchObject({
        counter: 5,
        backedUp: true,
        lastUsedAt: usedAt,
      });
      expect(await storeA.findByCredentialId('nope')).toBeNull();
    });

    it('rejects a second registration of the same credential with a unique violation', async () => {
      await storeA.register(newPasskey());
      await expect(storeB.register(newPasskey({ name: 'Copy' }))).rejects.toMatchObject({ message: /UNIQUE/i });
    });

    it("lists a user's passkeys newest first and only theirs", async () => {
      const older = await storeA.register(newPasskey({ credentialId: 'a' }));
      await first.getRepository(Passkey).update(older.id, { createdAt: new Date(Date.now() - 60_000) });
      await storeA.register(newPasskey({ credentialId: 'b' }));
      await storeA.register(newPasskey({ credentialId: 'c', userId: 8 }));

      expect((await storeA.listForUser(7)).map((passkey) => passkey.credentialId)).toEqual(['b', 'a']);
    });

    it('renames and deletes only passkeys the user owns', async () => {
      const passkey = await storeA.register(newPasskey());

      expect(await storeA.renameOwned(8, passkey.id, 'Stolen')).toBeNull();
      expect(await storeA.deleteOwned(8, passkey.id)).toBe(false);
      expect(await storeA.renameOwned(7, passkey.id, 'Renamed')).toMatchObject({ name: 'Renamed' });
      expect(await storeA.deleteOwned(7, passkey.id)).toBe(true);
      expect(await storeA.deleteOwned(7, passkey.id)).toBe(false);
    });

    it('finds the account a passkey signs in', async () => {
      expect(await storeA.findSignInUser(7)).toMatchObject({ id: 7, username: 'maker', isEmailVerified: true });
      expect(await storeA.findSignInUser(99)).toBeNull();
    });
  });
});
