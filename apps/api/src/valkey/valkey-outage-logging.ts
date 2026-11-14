import type { EventEmitter } from 'node:events';
import type { LoggerService } from '@nestjs/common';

export interface ValkeyOutageMessages {
  /** Warned once per outage, with the reason from {@link describeValkeyError}. */
  lost: (reason: string) => string;
  /** Logged on the first `ready` after an outage. */
  reconnected: string;
  /** Logged on the client's first `ready` when no outage came before it. */
  connected?: string;
}

/**
 * Describes an ioredis error by its message, or its code when the message is empty. Never log the error object:
 * AUTH errors carry the password in `error.command.args`.
 */
export function describeValkeyError(error: NodeJS.ErrnoException): string {
  return error.message || error.code || 'unknown error';
}

/**
 * ioredis emits `error` on every reconnect attempt; this logs each outage once and its recovery once. Attach it right
 * after creating the client, before any command, so ioredis never reports an unhandled `error` event.
 */
export function logValkeyOutages(
  client: EventEmitter,
  logger: Pick<LoggerService, 'log' | 'warn'>,
  messages: ValkeyOutageMessages,
): void {
  let state: 'starting' | 'connected' | 'disconnected' = 'starting';
  client.on('error', (error: NodeJS.ErrnoException) => {
    if (state === 'disconnected') {
      return;
    }
    state = 'disconnected';
    logger.warn(messages.lost(describeValkeyError(error)));
  });
  client.on('ready', () => {
    if (state === 'disconnected') {
      logger.log(messages.reconnected);
    } else if (state === 'starting' && messages.connected) {
      logger.log(messages.connected);
    }
    state = 'connected';
  });
}
