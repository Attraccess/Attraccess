// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RpcError, SetupStepError, ShellyBleError } from '../../bluetooth/errors';
import { JoinTimeoutError } from '../../bluetooth/provisioning';
import { describeSetupError } from './describeSetupError';

const t = (key: string, data?: Record<string, string | number>) => `${key}${data ? JSON.stringify(data) : ''}`;

describe('describeSetupError', () => {
  it('reports a join timeout with the last Wi-Fi status', () => {
    const err = new SetupStepError('join', new JoinTimeoutError('connecting'), { status: 'connecting' });
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
});
