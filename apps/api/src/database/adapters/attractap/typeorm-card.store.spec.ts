import type { NFCCard, NFCCardPendingChange } from '@attraccess/database-entities';
import { QueryFailedError, type Repository } from 'typeorm';
import { CardAlreadyEnrolledError } from '../../../attractap/card-store.port';
import { NFC_CARD_UID_INDEX, TypeOrmAttractapCardStore } from './typeorm-card.store';

/** A PostgreSQL error as TypeORM wraps it (the driver error's fields are copied onto the QueryFailedError). */
function driverFailure(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError('INSERT …', [], Object.assign(new Error('rejected'), { code, constraint }));
}

describe('TypeOrmAttractapCardStore.create: failures', () => {
  const owner = {
    id: 1,
    username: 'alice',
    firstName: null,
    lastName: null,
    email: 'alice@example.test',
    locale: 'en',
    dateTimeLocale: null,
    isEmailVerified: true,
  };
  const storeFailingWith = (error: unknown) =>
    new TypeOrmAttractapCardStore(
      { manager: { transaction: jest.fn().mockRejectedValue(error) } } as unknown as Repository<NFCCard>,
      {} as Repository<NFCCardPendingChange>,
    );
  const create = (error: unknown) => storeFailingWith(error).create(owner, { uid: '04aa', keyNo: 1, key: 'k' }, true);

  it('reports a violation of the card UID index as an enrolled card', async () => {
    await expect(create(driverFailure('23505', NFC_CARD_UID_INDEX))).rejects.toBeInstanceOf(CardAlreadyEnrolledError);
  });

  it.each([
    ['another unique constraint', driverFailure('23505', 'PK_nfc_card')],
    ['a unique violation without constraint name', driverFailure('23505')],
    ['a foreign key violation', driverFailure('23503', NFC_CARD_UID_INDEX)],
    ['a non-database error', new Error('boom')],
  ])('lets %s through unchanged', async (_name, error) => {
    await expect(create(error)).rejects.toBe(error);
  });
});
