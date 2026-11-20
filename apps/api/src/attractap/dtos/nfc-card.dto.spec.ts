import type { AttractapCardOwner, AttractapNfcCard } from '@attraccess/application-models';
import { toNfcCardDto } from './nfc-card.dto';

describe('NFC card response mapping', () => {
  const owner: AttractapCardOwner = {
    id: 3,
    username: 'jane',
    email: 'jane@example.test',
    locale: 'en',
    dateTimeLocale: null,
    isEmailVerified: true,
    isDisabled: false,
    externalIdentifier: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const card: AttractapNfcCard = {
    id: 7,
    uid: '04AABBCC',
    keyNo: 2,
    key: 'a'.repeat(32),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeen: new Date(0),
    isActive: true,
    user: owner,
  };

  it('never carries the card key, the key slot or the owner e-mail address', () => {
    const json = JSON.stringify(toNfcCardDto(card));
    expect(json).not.toContain('a'.repeat(32));
    expect(json).not.toContain('jane@example.test');
    expect(toNfcCardDto(card)).not.toHaveProperty('key');
    expect(toNfcCardDto(card)).not.toHaveProperty('keyNo');
    expect(toNfcCardDto(card).user).toMatchObject({ id: 3, username: 'jane' });
  });

  it('leaves the owner out of a card that was read without it', () => {
    expect(toNfcCardDto({ ...card, user: undefined })).not.toHaveProperty('user');
  });
});
