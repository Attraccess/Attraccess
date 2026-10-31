import type { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

/**
 * Parses JSON events from text frames only. Binary frames never reach the gateway handlers:
 * on Attractap session connections they carry TLS bytes, and a JSON-looking binary frame
 * injected by someone on the network must not be dispatched as if the reader had sent it.
 * Every client (readers, companion) sends its events as text frames.
 */
export function parseTextFrameEvent(data: unknown): { event: string; data: unknown } | null {
  if (typeof data !== 'string') return null;
  const message = JSON.parse(data) as { event: string; data: unknown };
  return message && typeof message === 'object' ? message : null;
}

export function createWsAdapter(app: INestApplicationContext): WsAdapter {
  return new WsAdapter(app, { messageParser: parseTextFrameEvent });
}
