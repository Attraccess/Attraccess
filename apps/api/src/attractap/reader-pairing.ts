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

/** Why a card tap of a reader that is not paired is refused. */
export const PAIRING_REQUIRED = 'PAIRING_REQUIRED';

export function assertReaderPaired(reader: Pick<Attractap, 'pairingState'>): void {
  if (!isPaired(reader)) throw new BadRequestException(READER_NOT_PAIRED);
}

/**
 * Tells a connected reader that is not paired to pair. It gets READER_START_PAIRING with a ticket bound
 * to its own record, so the pairing stays attached to that record (name, machines, settings). Firmware
 * 1.8.0 and newer pairs with it; older firmware ignores the unknown event and keeps its token for the
 * firmware update. Never READER_UNAUTHORIZED: every firmware drops its token on it, and pairs unbound
 * (orphaning the record) or, before 1.8.0, cannot come back at all.
 * Not while this connection runs a firmware update, and at most every two minutes per reader (the
 * pairing service decides), since a failed pairing sends the reader straight back here.
 */
export async function promptPairing(
  socket: AuthenticatedWebSocket,
  pairing: { issueBindingTicket(readerId: number): string; claimAutoPrompt(readerId: number): boolean },
): Promise<void> {
  if (typeof socket.readerId !== 'number' || socket.state.ota) return;
  if (!pairing.claimAutoPrompt(socket.readerId)) return;
  await socket.sendMessage(
    new AttractapEvent(AttractapEventType.READER_START_PAIRING, {
      ticket: pairing.issueBindingTicket(socket.readerId),
    }),
  );
}
