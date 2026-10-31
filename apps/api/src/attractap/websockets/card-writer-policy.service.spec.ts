import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { ATTRACTAP_KEYS, ATTRACTAP_PARENT } from '../../settings/constants';
import { CardWriterPolicyService, READER_NOT_ALLOWED_TO_WRITE_CARDS } from './card-writer-policy.service';

describe('CardWriterPolicyService', () => {
  let stored: Map<string, string | null>;
  let policy: CardWriterPolicyService;

  const store = (key: string, value: string | null) => stored.set(`${ATTRACTAP_PARENT}.${key}`, value);

  beforeEach(async () => {
    stored = new Map();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardWriterPolicyService,
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
    await expect(policy.get()).resolves.toEqual({ mode: 'all', readerIds: [] });
    await expect(policy.isAllowed(7)).resolves.toBe(true);
  });

  it('treats an unknown stored mode as "all"', async () => {
    store(ATTRACTAP_KEYS.cardWriterMode, 'nobody');
    await expect(policy.get()).resolves.toEqual({ mode: 'all', readerIds: [] });
  });

  it('allows only the selected readers in "selected" mode', async () => {
    await policy.set({ mode: 'selected', readerIds: [3, 1] });
    await expect(policy.isAllowed(1)).resolves.toBe(true);
    await expect(policy.isAllowed(3)).resolves.toBe(true);
    await expect(policy.isAllowed(2)).resolves.toBe(false);
  });

  it('allows every reader in "all" mode even with a stored list', async () => {
    await policy.set({ mode: 'all', readerIds: [1] });
    await expect(policy.isAllowed(2)).resolves.toBe(true);
  });

  it('stores the reader list de-duplicated and sorted', async () => {
    await expect(policy.set({ mode: 'selected', readerIds: [5, 2, 5, 2, 9] })).resolves.toEqual({
      mode: 'selected',
      readerIds: [2, 5, 9],
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
    await expect(policy.get()).resolves.toEqual({ mode: 'selected', readerIds: [] });
    await expect(policy.isAllowed(1)).resolves.toBe(false);
  });

  it('drops stored ids that are not integers', async () => {
    store(ATTRACTAP_KEYS.cardWriterMode, 'selected');
    store(ATTRACTAP_KEYS.cardWriterReaders, '[1, "2", 3.5, null, 4, true]');
    await expect(policy.get()).resolves.toEqual({ mode: 'selected', readerIds: [1, 4] });
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
