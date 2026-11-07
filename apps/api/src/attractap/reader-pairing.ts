import { BadRequestException } from '@nestjs/common';
import type { Attractap } from '@attraccess/database-entities';

/** Error code the frontend translates; see api-errors.{en,de}.json. */
export const READER_NOT_PAIRED = 'READER_NOT_PAIRED';

/**
 * A reader that is not paired yet (never paired, or its pairing was revoked) exists only for the
 * pairing session: it is listed there and nowhere else, and it is never a target for card writing,
 * supervision or mass introduction.
 */
export const isPaired = (reader: Pick<Attractap, 'pairingState'> | null | undefined): boolean =>
  reader?.pairingState === 'paired';

export function assertReaderPaired(reader: Pick<Attractap, 'pairingState'>): void {
  if (!isPaired(reader)) throw new BadRequestException(READER_NOT_PAIRED);
}
