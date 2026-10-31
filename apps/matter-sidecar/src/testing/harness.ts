import {
  COMPATIBILITY_TABLE,
  HEADER_ATTRACCESS_VERSION,
  HEADER_PLUGIN_VERSION,
  HEADER_SIDECAR_VERSION,
  HEADER_WIRE_VERSION,
  type ServerMessage,
} from '@attraccess/matter-contract';
import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { configWith, type SidecarConfig } from '../config';
import { createLogger } from '../logger';
import { createSidecar, type Sidecar, type SidecarOptions } from '../sidecar';

export const SIMULATED_MATTER_VERSION = COMPATIBILITY_TABLE[0].matterJs;
const entry = COMPATIBILITY_TABLE[0];

/** A matter.js stand-in. Integration tests simulate Matter features; no real controller, fabric or device is used. */
export const simulatedPlatform = async () => ({ version: SIMULATED_MATTER_VERSION, close: async () => undefined });

export function validHeaders(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const headers: Record<string, string | undefined> = {
    [HEADER_WIRE_VERSION]: '1',
    [HEADER_ATTRACCESS_VERSION]: '1.11.0',
    [HEADER_PLUGIN_VERSION]: entry.plugin,
    [HEADER_SIDECAR_VERSION]: entry.sidecar,
    ...overrides,
  };
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<
    string,
    string
  >;
}

export type Running = { sidecar: Sidecar; port: number; logs: string[]; stop(): Promise<void> };

export async function startSidecar(
  overrides: Partial<SidecarConfig> = {},
  options: Partial<SidecarOptions> = {},
): Promise<Running> {
  const logs: string[] = [];
  const sidecar = createSidecar({
    config: configWith(overrides),
    logger: createLogger((line) => logs.push(line)),
    loadPlatform: simulatedPlatform,
    ...options,
  });
  const { port } = await sidecar.start();
  return { sidecar, port, logs, stop: () => sidecar.stop() };
}

/** Parsed JSON response; tests assert on its shape directly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = any;

export type HttpResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: JsonBody;
  raw: string;
};

export function http(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: options.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown = raw;
        try {
          body = JSON.parse(raw);
        } catch {
          // keep raw text
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, raw });
      });
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

export class WsClient {
  readonly messages: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: (() => void)[] = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      this.notify();
    });
    socket.on('close', (code, reason) => {
      this.closed = { code, reason: String(reason) };
      this.notify();
    });
    socket.on('error', () => undefined);
  }

  static async connect(port: number, headers: Record<string, string> = validHeaders(), maxPayload?: number) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/events`, { headers, maxPayload });
    const client = new WsClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
      socket.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
    return client;
  }

  private notify() {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  async until(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`timed out; messages=${JSON.stringify(this.messages).slice(0, 500)}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  send(message: unknown) {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  events() {
    return this.messages.flatMap((message) => (message.type === 'event' ? [message] : []));
  }

  close() {
    this.socket.terminate();
  }
}

export function upgradeStatus(
  port: number,
  headers: Record<string, string>,
  path = '/v1/events',
): Promise<{ status: number; body: JsonBody }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    socket.on('open', () => {
      socket.terminate();
      resolve({ status: 101, body: null });
    });
    socket.on('unexpected-response', (_req, res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }),
      );
    });
    socket.on('error', reject);
  });
}
