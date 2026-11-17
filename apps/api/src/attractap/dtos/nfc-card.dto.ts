import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';
import type { AttractapCardOwner, AttractapNfcCard } from '@attraccess/application-models';

/** The public columns of the card owner, as the user schema publishes them. */
export type NfcCardOwnerDto = Omit<AttractapCardOwner, 'email'>;

/** A card as the API publishes it. The card's key and key slot are deliberately not part of it. */
@ApiSchema({ name: 'NFCCard' })
export class NfcCardDto {
  @ApiProperty({ description: 'The ID of the NFC card' })
  id!: number;

  @ApiProperty({ description: 'The UID of the NFC card' })
  uid!: string;

  @ApiProperty({
    description: 'The ID of the user that owns the NFC card',
    allOf: [{ $ref: getSchemaPath('User') }],
  })
  user?: NfcCardOwnerDto;

  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last seen', type: 'string', format: 'date-time' })
  lastSeen!: Date;

  @ApiProperty({ description: 'Whether the NFC card is active' })
  isActive!: boolean;
}

/** The owner without the fields the user schema hides from responses (e-mail address among them). */
export function toNfcCardOwnerDto(owner: AttractapCardOwner): NfcCardOwnerDto {
  return {
    id: owner.id,
    username: owner.username,
    locale: owner.locale,
    dateTimeLocale: owner.dateTimeLocale,
    isEmailVerified: owner.isEmailVerified,
    isDisabled: owner.isDisabled,
    externalIdentifier: owner.externalIdentifier,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    ...(owner.deletedAt !== undefined ? { deletedAt: owner.deletedAt } : {}),
  };
}

/** Explicit mapping: `key` and `keyNo` never leave the service. */
export function toNfcCardDto(card: AttractapNfcCard): NfcCardDto {
  return {
    id: card.id,
    uid: card.uid,
    ...(card.user ? { user: toNfcCardOwnerDto(card.user) } : {}),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    lastSeen: card.lastSeen,
    isActive: card.isActive,
  };
}
