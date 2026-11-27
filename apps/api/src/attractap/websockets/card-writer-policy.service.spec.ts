import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { ATTRACTAP_KEYS, ATTRACTAP_PARENT } from '../../settings/constants';
import { CardWriterPolicyService, READER_NOT_ALLOWED_TO_WRITE_CARDS } from './card-writer-policy.service';
import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { ATTRACTAP_READER_STORE } from '../reader-store.port';

describe('CardWriterPolicyService', () => {
  let stored: Map<string, string | null>;
  let policy: CardWriterPolicyService;
  let securedReaders: Set<number>;

  const store = (key: string, value: string | null) => stored.set(`${ATTRACTAP_PARENT}.${key}`, value);

  beforeEach(async () => {
    stored = new Map();
    securedReaders = new Set();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardWriterPolicyService,
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
        {
          provide: ATTRACTAP_READER_STORE,
          useValue: {
            findSecurity: jest.fn(async (id: number) => (id === 404 ? undefined : { id, secured: securedReaders.has(id) })),
          },
        },
        {
          provide: SettingsStoreService,
          useValue: {
            getPlainSetting: jest.fn(async (parent: string, key: string) => stored.get(`${parent}.${key}`) ?? null),
            setPlainSetting: jest.fn(async (parent: string, key: string, value: string | null) => {
              stored.set(`${parent}.${key}`, value);
            }),
          },
        },
      ],
    }).compile();
    policy = moduleRef.get(CardWriterPolicyService);
  });

  it('defaults to every reader when nothing is stored', async () => {
    await expect(policy.get()).resolves.toEqual({ mode: 'all', readerIds: [], allowUidOnlyCards: false });
    await expect(policy.isAllowed(7)).resolves.toBe(true);
  });

  it('treats an unknown stored mode as "all"', async () => {
    store(ATTRACTAP_KEYS.cardWriterMode, 'nobody');
    await expect(policy.get()).resolves.toEqual({ mode: 'all', readerIds: [], allowUidOnlyCards: false });
  });

  it('allows only the selected readers in "selected" mode', async () => {
    await policy.set({ mode: 'selected', readerIds: [3, 1] });
    await expect(policy.isAllowed(1)).resolves.toBe(true);
    await expect(policy.isAllowed(3)).resolves.toBe(true);
    await expect(policy.isAllowed(2)).resolves.toBe(false);
  });

  describe('UID-only cards setting', () => {
    const key = `${ATTRACTAP_PARENT}.${ATTRACTAP_KEYS.allowUidOnlyCards}`;
    const actor = { id: 1, authenticationMethod: 'session' } as never;

    it('is off when nothing is stored or the value is anything but "true"', async () => {
      await expect(policy.isUidOnlyAllowed()).resolves.toBe(false);
      store(ATTRACTAP_KEYS.allowUidOnlyCards, 'yes');
      await expect(policy.isUidOnlyAllowed()).resolves.toBe(false);
      store(ATTRACTAP_KEYS.allowUidOnlyCards, 'true');
      await expect(policy.isUidOnlyAllowed()).resolves.toBe(true);
      await expect(policy.get()).resolves.toMatchObject({ allowUidOnlyCards: true });
    });

    it('keeps the stored value when an update does not send it', async () => {
      store(ATTRACTAP_KEYS.allowUidOnlyCards, 'true');
      await policy.set({ mode: 'all', readerIds: [] });
      expect(stored.get(key)).toBe('true');
    });

    it('stores the value an update sends', async () => {
      await expect(policy.set({ mode: 'all', readerIds: [], allowUidOnlyCards: true })).resolves.toMatchObject({
        allowUidOnlyCards: true,
      });
      expect(stored.get(key)).toBe('true');
    });

    it('audits each change as settings.updated with the setting key, before and after', async () => {
      const record = (policy as unknown as { audit: { record: jest.Mock } }).audit.record;
      await policy.update({ mode: 'all', readerIds: [], allowUidOnlyCards: true }, actor);
      await policy.update({ mode: 'all', readerIds: [], allowUidOnlyCards: true }, actor);
      await policy.update({ mode: 'all', readerIds: [], allowUidOnlyCards: false }, actor);
      expect(record.mock.calls.map(([event]) => event.details)).toEqual([
        { settingKey: 'attractap.allowUidOnlyCards', before: 'false', after: 'true' },
        { settingKey: 'attractap.allowUidOnlyCards', before: 'true', after: 'false' },
      ]);
    });

    it('writes and audits nothing for the setting when a reader update does not send it', async () => {
      const record = (policy as unknown as { audit: { record: jest.Mock } }).audit.record;
      await policy.update({ mode: 'all', readerIds: [] }, actor);
      expect(stored.has(key)).toBe(false);
      expect(record).not.toHaveBeenCalled();
    });

    it('switches only this setting through updateUidOnlyAllowed and audits each change', async () => {
      const record = (policy as unknown as { audit: { record: jest.Mock } }).audit.record;
      await policy.set({ mode: 'selected', readerIds: [2, 5] });

      await expect(policy.updateUidOnlyAllowed(true, actor)).resolves.toEqual({
        mode: 'selected',
        readerIds: [2, 5],
        allowUidOnlyCards: true,
      });
      await policy.updateUidOnlyAllowed(true, actor);
      await policy.updateUidOnlyAllowed(false, actor);

      expect(stored.get(key)).toBe('false');
      expect(stored.get(`${ATTRACTAP_PARENT}.${ATTRACTAP_KEYS.cardWriterReaders}`)).toBe('[2,5]');
      expect(record.mock.calls.map(([event]) => event.details)).toEqual([
        { settingKey: 'attractap.allowUidOnlyCards', before: 'false', after: 'true' },
        { settingKey: 'attractap.allowUidOnlyCards', before: 'true', after: 'false' },
      ]);
    });
  });

  it('allows only readers the server checked as secured in "secured" mode, whatever the list says', async () => {
    securedReaders.add(4);
    await policy.set({ mode: 'secured', readerIds: [1] });
    await expect(policy.get()).resolves.toMatchObject({ mode: 'secured', readerIds: [1] });
    await expect(policy.isAllowed(4)).resolves.toBe(true);
    await expect(policy.isAllowed(1)).resolves.toBe(false);
    await expect(policy.isAllowed(404)).resolves.toBe(false);
    await expect(policy.assertAllowed(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows every reader in "all" mode even with a stored list', async () => {
    await policy.set({ mode: 'all', readerIds: [1] });
    await expect(policy.isAllowed(2)).resolves.toBe(true);
  });

  it('stores the reader list de-duplicated and sorted', async () => {
    await expect(policy.set({ mode: 'selected', readerIds: [5, 2, 5, 2, 9] })).resolves.toEqual({
      mode: 'selected',
      readerIds: [2, 5, 9],
      allowUidOnlyCards: false,
    });
    expect(stored.get(`${ATTRACTAP_PARENT}.${ATTRACTAP_KEYS.cardWriterReaders}`)).toBe('[2,5,9]');
    expect(stored.get(`${ATTRACTAP_PARENT}.${ATTRACTAP_KEYS.cardWriterMode}`)).toBe('selected');
  });

  it.each([
    ['not JSON', '[1, 2'],
    ['a JSON object', '{"1": true}'],
    ['a JSON string', '"1,2"'],
  ])('reads a malformed stored list (%s) as empty, so "selected" allows no reader', async (_case, raw) => {
    store(ATTRACTAP_KEYS.cardWriterMode, 'selected');
    store(ATTRACTAP_KEYS.cardWriterReaders, raw);
    await expect(policy.get()).resolves.toEqual({ mode: 'selected', readerIds: [], allowUidOnlyCards: false });
    await expect(policy.isAllowed(1)).resolves.toBe(false);
  });

  it('drops stored ids that are not integers', async () => {
    store(ATTRACTAP_KEYS.cardWriterMode, 'selected');
    store(ATTRACTAP_KEYS.cardWriterReaders, '[1, "2", 3.5, null, 4, true]');
    await expect(policy.get()).resolves.toEqual({ mode: 'selected', readerIds: [1, 4], allowUidOnlyCards: false });
    await expect(policy.isAllowed(2)).resolves.toBe(false);
  });

  it('assertAllowed passes for an allowed reader and throws the translated code otherwise', async () => {
    await policy.set({ mode: 'selected', readerIds: [1] });
    await expect(policy.assertAllowed(1)).resolves.toBeUndefined();
    const error = await policy.assertAllowed(2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe(READER_NOT_ALLOWED_TO_WRITE_CARDS);
    expect(READER_NOT_ALLOWED_TO_WRITE_CARDS).toBe('READER_NOT_ALLOWED_TO_WRITE_CARDS');
  });
});
