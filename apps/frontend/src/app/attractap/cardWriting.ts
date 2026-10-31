import { Attractap } from '@attraccess/react-query-client';

/**
 * Why a reader cannot enroll or reset cards, whatever the administrator's card enrollment setting
 * says: firmware before 2.0.0 does not relay card commands to the server, and some readers have no
 * way to guide a member through enrollment.
 */
export type CardWritingBlocker = 'firmwareUpdateRequired' | 'noCardEnrollment';

export function cardWritingBlocker(reader: Pick<Attractap, 'firmware'>): CardWritingBlocker | null {
  const capabilities = reader.firmware?.capabilities;
  if (!capabilities?.cardRelay) return 'firmwareUpdateRequired';
  if (!capabilities.cardEnrollment) return 'noCardEnrollment';
  return null;
}
