import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedWebSocket } from '../../websocket.types';

/**
 * Error codes (HTTP exception messages) for arming a reader for a card flow: enrollment, reset,
 * web-started supervision and mass introduction. The frontend translates them.
 */
export const CARD_WRITE_START_ERRORS = {
  READER_NOT_FOUND: 'READER_NOT_FOUND',
  READER_OFFLINE: 'READER_OFFLINE',
  READER_BUSY: 'READER_BUSY',
  READER_FIRMWARE_UPDATE_REQUIRED: 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_NOT_ALLOWED_TO_WRITE_CARDS: 'READER_NOT_ALLOWED_TO_WRITE_CARDS',
  READER_CARD_ENROLLMENT_NOT_SUPPORTED: 'READER_CARD_ENROLLMENT_NOT_SUPPORTED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
} as const;

/**
 * Readers on firmware before 2.0.0 cannot relay card commands, so the server cannot check or write
 * a card through them. Every connection of the reader must relay: any of them may receive the card.
 */
export function assertReaderRelaysCards(sockets: readonly AuthenticatedWebSocket[]): void {
  if (sockets.some((socket) => !socket.state.cardRelay)) {
    throw new BadRequestException(CARD_WRITE_START_ERRORS.READER_FIRMWARE_UPDATE_REQUIRED);
  }
}
