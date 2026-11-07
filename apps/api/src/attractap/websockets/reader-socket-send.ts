import { Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { READER_UI_LIMITS } from '@attraccess/plugins-backend-sdk';
import { SEND_QUEUE_LIMIT_BYTES } from '../security/ws-byte-stream';
import { isUiMessageSuperseded } from './handlers/ui/ui-slot.service';
import { sanitizeForLVGL } from './websocket-lvgl';
import { AttractapEventType, AttractapMessage, AuthenticatedWebSocket, queuedSendBytes } from './websocket.types';

/**
 * Per-reader send queue limits (requirement: nothing queues without limit).
 *
 * A reader that stops reading (hung, Wi-Fi gone without a FIN) would let its queue grow forever, so
 * every send checks what is still waiting (`queuedSendBytes`). For a token reader that is `ws`'s
 * `bufferedAmount`; for a paired reader it is the TLS session's own queue, which the session caps at
 * 64 KiB (SEND_QUEUE_LIMIT_BYTES). The 1 MiB and 256 KiB values therefore only apply to token readers.
 *
 * The largest legitimate burst to one reader is far below these values: OTA is pulled one 4 KiB chunk
 * at a time (the firmware waits for each chunk before it requests the next, see
 * firmware/src/api/ota/ota_updater.cpp), card APDUs are capped at 32 KiB by the card conversation,
 * and a resource list is a few KiB per resource.
 */
export const READER_SEND_LIMITS = {
  /** Token readers: above this the reader is not reading any more; drop the message and cut it off. */
  maxBufferedBytes: 1024 * 1024,
  /** Token readers: above this an ACK retry would only queue another copy behind the first one; wait instead. */
  retryMaxBufferedBytes: 256 * 1024,
  /** Paired readers (session transport). */
  session: {
    /** What the session itself accepts: more than this already queued and the next message is refused. */
    maxQueuedBytes: SEND_QUEUE_LIMIT_BYTES,
    retryMaxQueuedBytes: 16 * 1024,
  },
  ackRetryCount: 3,
} as const;

export interface ReaderSenderContext {
  client: WebSocket;
  id: string;
  logger: Logger;
  /** UI_* ACKs echo the message id; it is passed so the right message is acknowledged. */
  waitForAck: (socket: AuthenticatedWebSocket, type: AttractapEventType, messageId?: number) => Promise<void>;
  /** Whether this socket is an open, authenticated reader that may receive READER_LANGUAGE. */
  canReceiveReaderLanguage: (socket: AuthenticatedWebSocket) => boolean;
  /** The server-wide reader language, if an update superseded the one captured at send time. */
  readerLanguage: () => string | undefined;
}

export type ReaderSenders = Pick<AuthenticatedWebSocket, 'sendMessage' | 'sendRaw' | 'sendBinaryData'>;

const isUiType = (type: string) => type.startsWith('UI_');

const isLanguageCarrier = (type: AttractapEventType) =>
  type === AttractapEventType.READER_LANGUAGE || type === AttractapEventType.READER_AUTHENTICATED;

export function createReaderSenders(context: ReaderSenderContext): ReaderSenders {
  const { client, id, logger } = context;
  const socket = client as unknown as AuthenticatedWebSocket;
  let messageCount = 0;

  const isSession = () => socket.transport === 'session';

  /** Queues `bytes` more unless the send queue would exceed its cap; then the reader is cut off. */
  const fitsQueue = (bytes: number, what: string): boolean => {
    const buffered = queuedSendBytes(socket);
    // A session takes one more message (up to 64 KiB) as long as no more than its limit is queued.
    const fits = isSession()
      ? buffered <= READER_SEND_LIMITS.session.maxQueuedBytes
      : buffered + bytes <= READER_SEND_LIMITS.maxBufferedBytes;
    if (fits) return true;
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

  /**
   * Hands `data` to the transport. False when it refused the message right away: a session reports a
   * closed session or a full queue synchronously through the callback. A token socket reports write
   * errors later; those surface as a missing ACK or a closed connection instead.
   */
  const write = (data: string | Buffer): boolean => {
    let refused = false;
    client.send(data, (error?: Error) => {
      if (error) refused = true;
    });
    return !refused;
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
      const retryLimit = isSession()
        ? READER_SEND_LIMITS.session.retryMaxQueuedBytes
        : READER_SEND_LIMITS.retryMaxBufferedBytes;
      const resend = i === 0 || queuedSendBytes(socket) <= retryLimit;
      if (resend) {
        // An older auth/update retry must not restore a superseded default.
        const language = context.readerLanguage();
        if (isLanguageCarrier(type) && language !== undefined) message.data.payload.language = language;
        if (isUiMessageSuperseded(socket, message)) return false;
        const stringifiedMessage = JSON.stringify(sanitizeForLVGL(message));
        // Legacy token readers cannot reassemble frames: a bigger UI frame would silently break parsing.
        if (isUiType(type) && Buffer.byteLength(stringifiedMessage, 'utf8') > READER_UI_LIMITS.maxFrameBytes) {
          logger.error(`Refusing to send ${type}: frame exceeds ${READER_UI_LIMITS.maxFrameBytes} bytes`);
          return false;
        }
        if (!fitsQueue(Buffer.byteLength(stringifiedMessage), type)) return false;
        logger.debug(`Sending ${message.event} of type ${type} to client ${id} (attempt ${attempt})`);
        if (!write(stringifiedMessage)) return false;
      } else {
        logger.debug(`Send queue of client ${id} is backed up; waiting for ACK of ${type} without resending`);
      }

      try {
        await context.waitForAck(socket, type, isUiType(type) ? message.data.messageId : undefined);
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
      return write(stringifiedMessage);
    } catch (error) {
      logger.error(`Failed to send raw message to client ${id}: ${(error as Error).message}`);
      return false;
    }
  };

  const sendBinaryData = (data: Buffer) => {
    try {
      if (!fitsQueue(data.length, 'binary data')) return;
      write(data);
    } catch (e) {
      logger.error(`Failed to send binary data to client ${id}: ${(e as Error).message}`);
    }
  };

  return { sendMessage, sendRaw, sendBinaryData };
}
