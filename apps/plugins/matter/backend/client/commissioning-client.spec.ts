import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar.test-utils';
import { SidecarRequestError } from './errors';
import { redactSecrets } from './errors';
import { SidecarHttpClient } from './rest-client';

const identity = { attraccessVersion: HOST_VERSION, pluginVersion: entry.plugin, sidecarVersion: entry.sidecar };
const CODE = '34970112332';
const QR = 'MT:Y.K9042C00KA0648G00';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('the commissioning operations over HTTP', () => {
  let fake: FakeSidecar;
  afterEach(() => fake?.stop());
  const client = () => new SidecarHttpClient({ url: fake.url, token: TOKEN }, identity);
  const answer = (res: ServerResponse, status: number, body: unknown) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  };

  it('sends the JSON body of the DELETE operations and keeps codes out of URLs', async () => {
    fake = await FakeSidecar.start();
    const seen: { method: string; url: string; body: string }[] = [];
    fake.restOverride = (req, res) => {
      if (!req.url?.startsWith('/v1/nodes/')) return 'pass';
      void readBody(req).then((body) => {
        seen.push({ method: req.method ?? '', url: req.url ?? '', body });
        if (req.method === 'DELETE' && req.url.endsWith('/commissioning-window')) {
          return answer(res, 200, { nodeId: '5', closed: true });
        }
        if (req.method === 'DELETE') return answer(res, 200, { nodeId: '5', result: 'forgotten', fabricGeneration: 3 });
        answer(res, 200, {
          nodeId: '5',
          manualCode: '36217551633',
          qrCode: QR,
          expiresAt: new Date().toISOString(),
        });
      });
    };
    await expect(
      client().call('nodes.remove', { params: { nodeId: '5' }, body: { force: true } }),
    ).resolves.toMatchObject({
      result: 'forgotten',
    });
    await expect(client().call('nodes.share.revoke', { params: { nodeId: '5' }, body: {} })).resolves.toEqual({
      nodeId: '5',
      closed: true,
    });
    await client().call('nodes.share.open', { params: { nodeId: '5' }, body: { timeoutSec: 300 } });
    expect(seen).toEqual([
      { method: 'DELETE', url: '/v1/nodes/5', body: '{"force":true}' },
      { method: 'DELETE', url: '/v1/nodes/5/commissioning-window', body: '{}' },
      { method: 'POST', url: '/v1/nodes/5/commissioning-window', body: '{"timeoutSec":300}' },
    ]);
  });

  it('puts the setup code only in the body of the start request', async () => {
    fake = await FakeSidecar.start();
    const seen: { url: string; body: string; headers: IncomingMessage['headers'] }[] = [];
    const id = randomUUID();
    fake.restOverride = (req, res) => {
      if (req.url !== '/v1/commissioning/sessions') return 'pass';
      void readBody(req).then((body) => {
        seen.push({ url: req.url ?? '', body, headers: req.headers });
        answer(res, 200, {
          sessionId: id,
          state: 'pending',
          step: null,
          nodeId: null,
          outcome: 'requested',
          failure: null,
          attestation: null,
          attestationOverrideAllowed: false,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          finishedAt: null,
        });
      });
    };
    await client().call('commissioning.start', { body: { setupCode: CODE } });
    expect(seen[0].url).not.toContain(CODE);
    expect(seen[0].body).toBe(JSON.stringify({ setupCode: CODE }));
    expect(JSON.stringify(seen[0].headers)).not.toContain(CODE);
  });

  it('redacts a setup or sharing code an error message or its details still carry', async () => {
    fake = await FakeSidecar.start();
    fake.restOverride = (req, res) => {
      if (req.url !== '/v1/commissioning/sessions') return 'pass';
      void readBody(req).then(() =>
        answer(res, 409, {
          error: {
            code: 'busy',
            message: `Busy with ${CODE} and ${QR}`,
            correlationId: randomUUID(),
            retryable: false,
            details: { setupCode: CODE, nested: { text: `code ${CODE}`, list: [QR] } },
          },
        }),
      );
    };
    const error = await client()
      .call('commissioning.start', { body: { setupCode: CODE } })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SidecarRequestError);
    const text = JSON.stringify({ message: (error as Error).message, details: (error as SidecarRequestError).details });
    expect(text).not.toContain(CODE);
    expect(text).not.toContain(QR);
    expect(text).toContain('[redacted]');
  });

  it('redacts exactly the shapes of codes', () => {
    expect(redactSecrets(`a ${CODE} b 123456789012345678901 c MT:ABCDEFGH123`)).toBe(
      'a [redacted] b [redacted] c [redacted]',
    );
    expect(redactSecrets('node 12345 on port 5540 at 1234567890123')).toBe('node 12345 on port 5540 at 1234567890123');
  });
});
