import { parseOperationalMessage } from './protocol';

describe('operational hardware readiness contract', () => {
  const state = {
    timestamp: '2026-09-05T20:00:00.000Z',
    streamId: 'boot-identity',
    sequence: 1,
    connected: true,
    revision: 1,
    contentHash: 'hash',
    inputs: { switch: true },
    outputs: {},
  };
  const parse = (readiness: unknown) =>
    parseOperationalMessage(
      'wago',
      'wago/v1/controllers/cc100/state',
      Buffer.from(JSON.stringify({ ...state, readiness })),
    );

  it.each([true, false])('preserves hardwareAvailable=%s', (hardwareAvailable) => {
    expect(parse({ hardwareAvailable })?.message).toEqual(
      expect.objectContaining({
        readiness: { hardwareAvailable },
        inputs: { switch: true },
      }),
    );
  });

  it('preserves absence without inventing hardware availability', () => {
    expect(parse(undefined)?.message).not.toHaveProperty('readiness');
  });

  it.each([null, false, [], {}, { hardwareAvailable: 'false' }, { hardwareAvailable: 0 }])(
    'rejects malformed readiness %j',
    (readiness) => {
      expect(() => parse(readiness)).toThrow('invalid state message');
    },
  );
});
