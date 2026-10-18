import { NFCCard, entities } from '@attraccess/database-entities';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rewrapCardKeys } from './card-key-rotation';
import { EncryptionService } from '../../encryption/encryption.service';

describe('transactional card key rewrapping', () => {
  let directory: string;
  let source: DataSource;
  let encryption: EncryptionService;
  const key = '0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'card-rewrap-'));
    writeFileSync(
      join(directory, 'keys.json'),
      JSON.stringify({
        active: 'new',
        keys: { new: Buffer.alloc(32, 1).toString('base64url') },
      }),
      { mode: 0o600 },
    );
    encryption = new EncryptionService(
      new ConfigService({
        app: {
          CARD_KEYRING_FILE: join(directory, 'keys.json'),
          AUTH_SESSION_SECRET: 'legacy-test-secret',
        },
      }),
    );
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
  });
  afterEach(async () => {
    await source?.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('preserves metadata and keys, supports encrypted backup restoration and is idempotent', async () => {
    const repository = source.getRepository(NFCCard);
    const plaintext = await repository.save({ uid: '0401', key, keyNo: 2, isActive: true });
    const legacy = await repository.save({ uid: '0402', key: encryption.encrypt(key), keyNo: 3, isActive: false });
    const backup = [plaintext, legacy];
    expect(await rewrapCardKeys(source, encryption)).toBe(2);
    const migrated = await repository.find({ order: { id: 'ASC' } });
    for (let i = 0; i < migrated.length; i++) {
      expect(migrated[i]).toEqual({ ...backup[i], key: expect.stringMatching(/^card1\.new\./) });
      expect(encryption.rewrapCardKey(migrated[i], migrated[i].key)).toBe(migrated[i].key);
    }
    expect(await rewrapCardKeys(source, encryption)).toBe(0);
    await repository.save(backup);
    expect(await rewrapCardKeys(source, encryption)).toBe(2);
  });

  it('rolls back earlier rows on corruption and resumes safely after repair', async () => {
    const repository = source.getRepository(NFCCard);
    const first = await repository.save({ uid: '0401', key, keyNo: 2 });
    const second = await repository.save({ uid: '0402', key: 'v2.unsupported', keyNo: 3 });
    await expect(rewrapCardKeys(source, encryption)).rejects.toThrow();
    expect((await repository.findOneByOrFail({ id: first.id })).key).toBe(key);
    await repository.update(second.id, { key: encryption.encrypt(key) });
    expect(await rewrapCardKeys(source, encryption)).toBe(2);
    expect(await rewrapCardKeys(source, encryption)).toBe(0);
  });

  it('rejects a row changed after its snapshot and rolls back the batch', async () => {
    const repository = source.getRepository(NFCCard);
    const row = await repository.save({ uid: '0401', key, keyNo: 2 });
    const original = encryption.rewrapCardKey.bind(encryption);
    jest.spyOn(encryption, 'rewrapCardKey').mockImplementation((context, stored) => {
      context.uid = 'different';
      return original({ ...context, uid: row.uid }, stored);
    });
    await expect(rewrapCardKeys(source, encryption)).rejects.toThrow('Card key rewrap conflict');
    expect(await repository.findOneByOrFail({ id: row.id })).toEqual(row);
  });
});
