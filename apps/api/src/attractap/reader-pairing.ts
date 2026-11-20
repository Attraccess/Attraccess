import { BadRequestException } from '@nestjs/common';
import type { AttractapReader } from '@attraccess/application-models';

/** Error code the frontend translates; see api-errors.{en,de}.json. */
export const READER_NOT_PAIRED = 'READER_NOT_PAIRED';

/**
 * A reader whose pairing was revoked exists only for the
 * pairing session: it is listed there and nowhere else, and it is never a target for card writing,
 * supervision or mass introduction.
 */
export const isPaired = (reader: Pick<AttractapReader, 'pairingState'> | null | undefined): boolean =>
  reader?.pairingState === 'paired';

export function assertReaderPaired(reader: Pick<AttractapReader, 'pairingState'>): void {
  if (!isPaired(reader)) throw new BadRequestException(READER_NOT_PAIRED);
}
