import { Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { sanitizeForLVGL } from './lvgl-text';
import { AttractapEventType, AttractapMessage, AuthenticatedWebSocket } from './websocket.types';

/**
 * Per-reader send queue limits (requirement: nothing queues without limit).
 *
 * `ws` keeps whatever the kernel did not accept yet in `socket.bufferedAmount`. A reader that stops
 * reading (hung, Wi-Fi gone without a FIN) would let that grow forever, so every send checks it.
 *
 * The largest legitimate burst to one reader is far below these values: OTA is pulled one 4 KiB chunk
 * at a time (the firmware waits for each chunk before it requests the next, see
 * firmware/src/api/ota/ota_updater.cpp), card APDUs are capped at 32 KiB by the card conversation,
 * and a resource list is a few KiB per resource.
 */
export const READER_SEND_LIMITS = {
  /** Above this the reader is not reading any more: drop the message and terminate the connection. */
  maxBufferedBytes: 1024 * 1024,
  /** Above this an ACK retry would only queue another copy behind the first one: wait instead. */
  retryMaxBufferedBytes: 256 * 1024,
  ackRetryCount: 3,
} as const;

/**
 * Largest message the server accepts from a reader (ws default: 100 MiB). The largest legitimate one
 * is READER_CRASH_REPORT: a coredump of at most 32 KiB (CRASH_COREDUMP_MAX_BYTES in
 * firmware/src/api/diagnostics/crash-record.hpp), about 44 KiB in base64, plus a few small fields.
 * Every other reader message is a few hundred bytes. ws closes the connection with 1009 above this.
 */
export const READER_MAX_INBOUND_PAYLOAD_BYTES = 256 * 1024;

export interface ReaderSenderContext {
  client: WebSocket;
  id: string;
  logger: Logger;
  waitForAck: (socket: AuthenticatedWebSocket, type: AttractapEventType) => Promise<void>;
  /** Whether this socket is an open, authenticated reader that may receive READER_LANGUAGE. */
  canReceiveReaderLanguage: (socket: AuthenticatedWebSocket) => boolean;
  /** The server-wide reader language, if an update superseded the one captured at send time. */
  readerLanguage: () => string | undefined;
}

export type ReaderSenders = Pick<AuthenticatedWebSocket, 'sendMessage' | 'sendRaw' | 'sendBinaryData'>;

const isLanguageCarrier = (type: AttractapEventType) =>
  type === AttractapEventType.READER_LANGUAGE || type === AttractapEventType.READER_AUTHENTICATED;

export function createReaderSenders(context: ReaderSenderContext): ReaderSenders {
  const { client, id, logger } = context;
  const socket = client as unknown as AuthenticatedWebSocket;
  let messageCount = 0;

  /** Queues `bytes` more unless the send queue would exceed its cap; then the reader is cut off. */
  const fitsQueue = (bytes: number, what: string): boolean => {
    const buffered = client.bufferedAmount ?? 0;
    if (buffered + bytes <= READER_SEND_LIMITS.maxBufferedBytes) return true;
    // Never log the message itself: it may carry card APDUs or reader data.
    logger.error(
      `Send queue of client ${id} (reader ${socket.readerId ?? 'unknown'}) is full ` +
        `(${buffered} bytes buffered); dropping ${what} and closing the connection.`,
    );
    try {
      client.terminate();
    } catch {
      // already gone
    }
    return false;
  };

  const sendMessage = async (message: AttractapMessage): Promise<boolean> => {
    messageCount++;
    message.data.messageId = messageCount;

    const readerId = socket.readerId;
    const authenticationAttempt = socket.state.readerAuthenticationAttempt;
    const type = message.data.type;

    for (let i = 0; i < READER_SEND_LIMITS.ackRetryCount; i++) {
      const attempt = `${i + 1}/${READER_SEND_LIMITS.ackRetryCount}`;
      // Authentication success and language retries belong to the current open reader connection.
      if (
        isLanguageCarrier(type) &&
        (!context.canReceiveReaderLanguage(socket) ||
          socket.readerId !== readerId ||
          socket.state.readerAuthenticationAttempt !== authenticationAttempt)
      )
        return false;

      // A retry while the first copy is still queued would only add a second copy behind it.
      const resend = i === 0 || (client.bufferedAmount ?? 0) <= READER_SEND_LIMITS.retryMaxBufferedBytes;
      if (resend) {
        // An older auth/update retry must not restore a superseded default.
        const language = context.readerLanguage();
        if (isLanguageCarrier(type) && language !== undefined) message.data.payload.language = language;
        const stringifiedMessage = JSON.stringify(sanitizeForLVGL(message));
        if (!fitsQueue(Buffer.byteLength(stringifiedMessage), type)) return false;
        logger.debug(`Sending ${message.event} of type ${type} to client ${id} (attempt ${attempt})`);
        client.send(stringifiedMessage);
      } else {
        logger.debug(`Send queue of client ${id} is backed up; waiting for ACK of ${type} without resending`);
      }

      try {
        await context.waitForAck(socket, type);
        return true;
      } catch (error) {
        logger.debug(`Attempt ${attempt} failed: ${(error as Error).message}`);
      }
    }

    logger.error(
      `Client did not send ACK for ${type} after ${READER_SEND_LIMITS.ackRetryCount} attempts. Won't try again.`,
    );
    return false;
  };

  const sendRaw = (message: AttractapMessage): boolean => {
    if (client.readyState !== WebSocket.OPEN) return false;
    try {
      const stringifiedMessage = JSON.stringify(message);
      if (!fitsQueue(Buffer.byteLength(stringifiedMessage), message.data.type)) return false;
      client.send(stringifiedMessage);
      return true;
    } catch (error) {
      logger.error(`Failed to send raw message to client ${id}: ${(error as Error).message}`);
      return false;
    }
  };

  const sendBinaryData = (data: Buffer) => {
    try {
      if (!fitsQueue(data.length, 'binary data')) return;
      client.send(data as unknown as BufferSource);
    } catch (e) {
      logger.error(`Failed to send binary data to client ${id}: ${(e as Error).message}`);
    }
  };

  return { sendMessage, sendRaw, sendBinaryData };
}
