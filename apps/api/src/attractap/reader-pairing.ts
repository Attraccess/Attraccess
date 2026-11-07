import { BadRequestException } from '@nestjs/common';
import type { Attractap } from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from './websockets/websocket.types';

/** Error code the frontend translates; see api-errors.{en,de}.json. */
export const READER_NOT_PAIRED = 'READER_NOT_PAIRED';

/**
 * A reader that is not paired yet (never paired, or its pairing was revoked) exists only for the
 * pairing session: it is listed there and nowhere else, and it is never a target for card writing,
 * supervision or mass introduction.
 */
export const isPaired = (reader: Pick<Attractap, 'pairingState'> | null | undefined): boolean =>
  reader?.pairingState === 'paired';

/** What a connected reader that is not paired gets instead of any function; the reader starts pairing. */
export const PAIRING_REQUIRED = 'PAIRING_REQUIRED';

export function assertReaderPaired(reader: Pick<Attractap, 'pairingState'>): void {
  if (!isPaired(reader)) throw new BadRequestException(READER_NOT_PAIRED);
}

/** A reader that was just asked to start pairing is not asked again by its next refused events for this long. */
const PAIRING_PROMPT_INTERVAL_MS = 60 * 1000;

/**
 * Tells a connected reader that is not paired to pair. A token reader on current firmware gets
 * READER_START_PAIRING with a ticket bound to its own record, so the pairing stays attached to that
 * record (name, machines, settings). READER_UNAUTHORIZED would make it drop its token and start an
 * unbound pairing, orphaning the record. Readers that cannot relay cards yet get PAIRING_REQUIRED.
 * `throttle` skips the push when this connection was prompted a moment ago (refused events).
 */
export async function promptPairing(
  socket: AuthenticatedWebSocket,
  pairing: { issueBindingTicket(readerId: number): string },
  throttle = false,
): Promise<void> {
  if (!socket.state.cardRelay || typeof socket.readerId !== 'number') {
    await socket.sendMessage(new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, { message: PAIRING_REQUIRED }));
    return;
  }
  const now = Date.now();
  if (throttle && now - (socket.state.pairingPromptedAt ?? 0) < PAIRING_PROMPT_INTERVAL_MS) return;
  socket.state.pairingPromptedAt = now;
  await socket.sendMessage(
    new AttractapEvent(AttractapEventType.READER_START_PAIRING, {
      ticket: pairing.issueBindingTicket(socket.readerId),
    }),
  );
}
