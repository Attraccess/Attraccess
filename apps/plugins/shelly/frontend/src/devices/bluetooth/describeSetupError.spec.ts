// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JoinTimeoutError, RpcError, SetupStepError, ShellyBleError } from '../../bluetooth/errors';
import { describeConnectError, describeSetupError as describe_ } from './describeSetupError';

const t = (key: string, data?: Record<string, unknown>) => `${key}${data ? JSON.stringify(data) : ''}`;
/** Title and detail joined, so each assertion can look at the whole message. */
const describeSetupError = (...args: Parameters<typeof describe_>) => {
  const { title, detail } = describe_(...args);
  return `${title} | ${detail}`;
};

describe('describeSetupError', () => {
  it('reports a join timeout with the last Wi-Fi status', () => {
    const err = new SetupStepError('join', new JoinTimeoutError('connecting'));
    expect(describeSetupError(err, t)).toContain('ble.failure.joinTimeout{"status":"connecting"}');
  });

  it('reports a link lost while waiting for the join as a lost link, not a timeout', () => {
    const err = new SetupStepError('join', new ShellyBleError('linkLost', 'gone'));
    const message = describeSetupError(err, t);
    expect(message).toContain('ble.failure.linkLost');
    expect(message).not.toContain('joinTimeout');
  });

  it('reports a device error while waiting for the join with the method and code', () => {
    const err = new SetupStepError('join', new RpcError('WiFi.GetStatus', -103, 'nope'));
    expect(describeSetupError(err, t)).toContain('ble.failure.rpc');
  });

  it('puts the server message in brackets so it needs no trailing punctuation', () => {
    const err = new SetupStepError('register', new Error('Internal server error.'));
    expect(describeSetupError(err, t)).toContain('ble.failure.registerFailed{"message":"Internal server error"}');
  });

  it('falls back to a text without detail when the server sent no message', () => {
    const err = new SetupStepError('register', new Error(''));
    expect(describeSetupError(err, t)).toContain('ble.failure.registerFailedNoDetail');
  });

  it('names the password check step for an already protected device', () => {
    const err = new SetupStepError('password', new ShellyBleError('wrongPassword', 'rejected'));
    expect(describeSetupError(err, t, { protectedDevice: true })).toContain('ble.steps.passwordCheck');
    expect(describeSetupError(err, t)).toContain('ble.steps.password');
  });

  it('puts the step in the title and the cause in the detail', () => {
    const err = new SetupStepError('wifi', new ShellyBleError('linkLost', 'gone'));
    expect(describe_(err, t)).toEqual({
      title: 'ble.failure.title{"step":"ble.steps.wifi"}',
      detail: 'ble.failure.linkLost',
    });
  });

  it('clips a very long device message', () => {
    const err = new SetupStepError('wifi', new RpcError('WiFi.SetConfig', -1, 'x'.repeat(5000)));
    expect(describe_(err, t).detail.length).toBeLessThan(400);
  });
});

describe('describeConnectError', () => {
  const named = (name: string, message: string) => Object.assign(new Error(message), { name });

  it('explains a switched-off Bluetooth adapter', () => {
    expect(describeConnectError(named('NotFoundError', 'Bluetooth adapter not available.'), t)).toBe(
      'ble.connect.adapterOff',
    );
  });

  it('explains a device without the RPC service', () => {
    expect(describeConnectError(new ShellyBleError('noRpcService', 'none'), t)).toBe('ble.connect.noRpcService');
  });
});
