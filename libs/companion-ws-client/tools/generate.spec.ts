import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('fs', () => io);

async function generate(spec: unknown) {
  io.readFileSync.mockReturnValue(JSON.stringify(spec));
  await import('./generate');
  return Object.fromEntries(
    io.writeFileSync.mock.calls.map(([file, source]) => [String(file).split('/').pop(), source]),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('companion websocket generator', () => {
  it('preserves required properties, references, arrays and message directions', async () => {
    const output = await generate({
      channels: {
        COMPANION_REGISTER: { publish: { message: { payload: { $ref: '#/components/schemas/Register' } } } },
        COMPANION_REGISTER_RESPONSE: { subscribe: { message: { payload: { $ref: '#/components/schemas/Response' } } } },
        COMPANION_PING: { publish: {}, subscribe: { message: { payload: { $ref: '#/components/schemas/Object' } } } },
      },
      components: {
        schemas: {
          Register: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Device name' },
              nested: { $ref: '#/components/schemas/Nested' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Nested' } },
              values: { type: 'array', items: { type: 'integer' } },
              metadata: { type: 'object', properties: { active: { type: 'boolean' }, count: { type: 'number' } } },
              empty: { type: 'object' },
              untyped: {},
              list: { type: 'array' },
            },
          },
          Nested: { type: 'object', properties: { id: { type: 'integer' } } },
          Response: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
        },
      },
    });
    expect(output['types.ts']).toContain('name: string;');
    expect(output['types.ts']).toContain('/** Device name */');
    expect(output['types.ts']).toContain('nested?: Nested;');
    expect(output['types.ts']).toContain('children?: Nested[];');
    expect(output['types.ts']).toContain('values?: number[];');
    expect(output['types.ts']).toContain('empty?: Record<string, never>;');
    expect(output['types.ts']).toContain('untyped?: unknown;');
    expect(output['types.ts']).toContain('list?: unknown[];');
    expect(output['types.ts']).toContain('ok: boolean;');
    expect(output['types.ts'].indexOf('interface Nested')).toBeLessThan(
      output['types.ts'].indexOf('interface Register'),
    );
    expect(output['client.ts']).toContain('sendRegister(payload: Register)');
    expect(output['client.ts']).toContain("this.send('COMPANION_REGISTER', payload)");
    expect(output['client.ts']).toContain("on(event: 'register_response', listener: (payload: Response) => void)");
    expect(output['client.ts']).toContain("this.emit('register_response', data)");
    expect(output['client.ts']).toContain("this.emit('ping')");
    expect(output['client.ts']).toContain('sendPing()');
    expect(output['types.ts'].match(/interface Nested/g)).toHaveLength(1);
  });

  it('supports an empty spec without producing a dangling type import', async () => {
    const output = await generate({ channels: {} });
    expect(output['types.ts']).not.toContain('interface');
    expect(output['client.ts']).not.toContain('import type');
    expect(output['client.ts']).toContain("on(event: 'connected'");
  });

  it('handles inline payloads and missing referenced schemas without crashing', async () => {
    const output = await generate({
      channels: {
        COMPANION_INLINE: { publish: { message: { payload: { type: 'array', items: { type: 'string' } } } } },
        COMPANION_MISSING: { subscribe: { message: { payload: { $ref: '#/components/schemas/Missing' } } } },
      },
    });
    expect(output['types.ts']).not.toContain('interface');
    expect(output['client.ts']).toContain('sendInline()');
    expect(output['client.ts']).toContain("this.emit('missing', data)");
  });
});
