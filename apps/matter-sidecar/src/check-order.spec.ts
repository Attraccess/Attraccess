import { COMPATIBILITY_TABLE, HEADER_WIRE_VERSION } from '@attraccess/matter-contract';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { TokenAuthenticator } from './auth';
import { TEST_TOKEN, configWith } from './testing/config';
import { EventStream } from './event-stream';
import { createLogger } from './logger';
import { handleRequest, type PipelineDeps } from './request-pipeline';
import { SIMULATED_MATTER_VERSION, validHeaders } from './testing/harness';
import { WebSocketHub } from './websocket-hub';

// A draining sidecar stops accepting connections at once, so a real socket cannot observe these refusals in order.
// The pipeline and the hub are driven directly instead, with the same dependencies the sidecar wires up.

const running = { sidecar: COMPATIBILITY_TABLE[0].sidecar, matterJs: SIMULATED_MATTER_VERSION };
// An HTTP client always sends Host; these requests do not go through one.
const headers = (overrides: Record<string, string | undefined> = {}) =>
  validHeaders({ host: '127.0.0.1:8581', ...overrides });
const anonymous = (overrides: Record<string, string | undefined> = {}) =>
  headers({ authorization: undefined, ...overrides });
const wrongToken = () => headers({ authorization: `Bearer ${'x'.repeat(40)}` });

type Reply = { status: number; code: string };

function parseReply(status: number, payload: string): Reply {
  return { status, code: JSON.parse(payload).error?.code };
}

function setup(options: { draining?: boolean; maxClients?: number } = {}) {
  const config = configWith({ maxClients: options.maxClients ?? 64 });
  const logger = createLogger(() => undefined);
  const auth = new TokenAuthenticator([TEST_TOKEN], logger);
  const isDraining = () => options.draining ?? false;
  const deps: PipelineDeps = {
    config,
    running,
    logger,
    auth,
    isDraining,
    features: { 'inventory.list': async () => ({ authoritative: false, nodes: [] }) },
    builtIns: {},
  };
  const stream = new EventStream({ maxEvents: config.replayMaxEvents, maxAgeMs: config.replayMaxAgeMs });
  const hub = new WebSocketHub(config, stream, running, isDraining, logger, auth);

  async function rest(requestHeaders: Record<string, string>, path = '/v1/nodes'): Promise<Reply> {
    let status = 0;
    let payload = '';
    const req = { method: 'GET', url: path, headers: requestHeaders, socket: { remoteAddress: '127.0.0.1' } };
    const res = {
      headersSent: false,
      writableEnded: false,
      writeHead: (code: number) => (status = code),
      end: (body: string) => (payload = body),
    };
    await handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse, deps);
    return parseReply(status, payload);
  }

  function upgrade(requestHeaders: Record<string, string>, path = '/v1/events'): Reply {
    let written = '';
    const socket = {
      remoteAddress: '127.0.0.1',
      on: () => socket,
      once: () => socket,
      end: (data: string) => (written = data),
      destroy: () => undefined,
    };
    const req = { method: 'GET', url: path, headers: requestHeaders };
    hub.handleUpgrade(req as unknown as IncomingMessage, socket as unknown as Duplex, Buffer.alloc(0));
    const [head, body] = written.split('\r\n\r\n');
    return parseReply(Number(head.split(' ')[1]), body);
  }

  return { rest, upgrade };
}

const unauthorized = { status: 401, code: 'unauthorized' };
const draining = { status: 503, code: 'sidecar_unavailable' };

describe('check order', () => {
  describe('while draining', () => {
    const { rest, upgrade } = setup({ draining: true });

    it('answers 401 before 503 on REST', async () => {
      expect(await rest(anonymous())).toEqual(unauthorized);
      expect(await rest(wrongToken())).toEqual(unauthorized);
      expect(await rest(headers())).toEqual(draining);
    });

    it('answers 401 before 503 on the WebSocket upgrade', () => {
      expect(upgrade(anonymous())).toEqual(unauthorized);
      expect(upgrade(wrongToken())).toEqual(unauthorized);
      expect(upgrade(headers())).toEqual(draining);
    });

    it('answers 503 before release admission once authenticated', async () => {
      const wrongWire = headers({ [HEADER_WIRE_VERSION]: '99' });
      expect(await rest(wrongWire)).toEqual(draining);
      expect(upgrade(wrongWire)).toEqual(draining);
    });

    it('still answers 403 for a browser Origin before anything else', async () => {
      const forbidden = { status: 403, code: 'forbidden_origin' };
      expect(await rest({ ...anonymous(), origin: 'http://evil.example' })).toEqual(forbidden);
      expect(upgrade({ ...anonymous(), origin: 'http://evil.example' })).toEqual(forbidden);
    });
  });

  describe('when the WebSocket client cap is reached', () => {
    const { rest, upgrade } = setup({ maxClients: 0 });

    it('answers 401 before the client cap', () => {
      expect(upgrade(anonymous())).toEqual(unauthorized);
      expect(upgrade(wrongToken())).toEqual(unauthorized);
      expect(upgrade(headers())).toEqual({ status: 503, code: 'sidecar_unavailable' });
    });

    it('answers 401 before release admission and admission before the cap', () => {
      expect(upgrade(anonymous({ [HEADER_WIRE_VERSION]: '99' }))).toEqual(unauthorized);
      expect(upgrade(headers({ [HEADER_WIRE_VERSION]: '99' }))).toEqual({
        status: 426,
        code: 'unsupported_wire_version',
      });
    });

    it('does not apply the cap to REST', async () => {
      expect(await rest(anonymous())).toEqual(unauthorized);
      expect((await rest(headers())).status).toBe(200);
    });
  });
});
