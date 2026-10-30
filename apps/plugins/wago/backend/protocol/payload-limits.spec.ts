import { WagoCommandHandler } from '../commands/handler';
import { isClaimAcknowledgement } from '../controllers/model';
import { WagoDiagnosticsStore } from '../diagnostics/store';
import {
  CONTROLLER_PAYLOAD_MAX_BYTES,
  CONTROLLER_PAYLOAD_MAX_DEPTH,
  exceedsJsonDepth,
  parseAnnouncement,
  parseControllerJson,
  parseHeartbeat,
  parseObject,
  parseOperationalMessage,
} from './index';

const oversized = () => Buffer.alloc(CONTROLLER_PAYLOAD_MAX_BYTES + 1, 0x20);
const nested = (levels: number) => Buffer.from('{"a":'.repeat(levels) + '1' + '}'.repeat(levels));
const announcement = {
  hardwareId: 'cc100-1',
  pairingCode: 'ABCD-1234',
  protocolVersion: '1.0',
  runtimeVersion: '0.2.10',
  capabilities: ['claim'],
};

/** Every server-side entry point that decodes a controller-originated payload. */
const entryPoints: Record<string, (payload: Buffer) => unknown> = {
  announcement: (payload) => parseAnnouncement(payload),
  heartbeat: (payload) => parseHeartbeat(payload),
  'operational message': (payload) =>
    parseOperationalMessage('attraccess/wago', 'attraccess/wago/v1/controllers/cc100-1/state', payload),
  'diagnostics ingest': (payload) => new WagoDiagnosticsStore(() => Date.now()).ingest(1, 'state', payload),
  'claim acknowledgement': (payload) => isClaimAcknowledgement(payload, 'token'),
  'command acknowledgement': (payload) => {
    const handler = Object.create(WagoCommandHandler.prototype) as WagoCommandHandler;
    Reflect.set(handler, 'pending', new Map());
    return handler.acknowledge(1, payload);
  },
};

describe('controller payload limits', () => {
  it('counts nesting without being fooled by brackets inside strings', () => {
    expect(exceedsJsonDepth('{"a":"[[[[[[[[[[","b":"\\"[["}', 2)).toBe(false);
    expect(exceedsJsonDepth(nested(CONTROLLER_PAYLOAD_MAX_DEPTH).toString(), CONTROLLER_PAYLOAD_MAX_DEPTH)).toBe(false);
    expect(exceedsJsonDepth(nested(CONTROLLER_PAYLOAD_MAX_DEPTH + 1).toString(), CONTROLLER_PAYLOAD_MAX_DEPTH)).toBe(
      true,
    );
  });

  it('accepts a payload of exactly the cap', () => {
    const body = Buffer.from(JSON.stringify({ pad: '' }));
    const padded = Buffer.from(JSON.stringify({ pad: 'x'.repeat(CONTROLLER_PAYLOAD_MAX_BYTES - body.byteLength) }));
    expect(padded.byteLength).toBe(CONTROLLER_PAYLOAD_MAX_BYTES);
    expect(parseObject(padded, 'probe')).toMatchObject({ pad: expect.any(String) });
  });

  it('counts bytes, not characters', () => {
    const wide = Buffer.from(JSON.stringify({ pad: 'é'.repeat(CONTROLLER_PAYLOAD_MAX_BYTES / 2) }));
    expect(() => parseControllerJson(wide, 'probe')).toThrow('too large');
  });

  it.each(Object.keys(entryPoints))('%s refuses an oversized payload before decoding it', (name) => {
    const payload = oversized();
    const toString = jest.spyOn(payload, 'toString');
    const parse = jest.spyOn(JSON, 'parse');
    try {
      try {
        expect(entryPoints[name](payload)).toBeFalsy();
      } catch (error) {
        expect((error as Error).message).toMatch(/too large/);
      }
      expect(toString).not.toHaveBeenCalled();
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it.each(Object.keys(entryPoints))('%s refuses a payload nested deeper than the limit', (name) => {
    const payload = Buffer.from(
      JSON.stringify({ ...announcement, extra: JSON.parse(nested(CONTROLLER_PAYLOAD_MAX_DEPTH).toString()) }),
    );
    const parse = jest.spyOn(JSON, 'parse');
    try {
      try {
        expect(entryPoints[name](payload)).toBeFalsy();
      } catch (error) {
        expect((error as Error).message).toMatch(/nested too deeply/);
      }
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('still accepts an ordinary announcement and heartbeat', () => {
    const payload = Buffer.from(JSON.stringify(announcement));
    expect(parseAnnouncement(payload).pairingCode).toBe('ABCD-1234');
    expect(parseHeartbeat(payload).hardwareId).toBe('cc100-1');
  });
});
