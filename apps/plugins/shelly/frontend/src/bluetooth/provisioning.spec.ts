// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SetupStepError } from './errors';
import { createFakeDevice, FAKE_DEVICE_ID, type FakeDeviceOptions } from './fakeDevice';
import { disableBluetooth, getDeviceInfo, runSetup, scanWifi, waitForIp, type SetupParams } from './provisioning';
import { ShellyBleRpc } from './rpc';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WIFI_PW = 'wifi-secret-123';
const ADMIN_PW = 'admin-secret-456';

function setup(options: FakeDeviceOptions = {}) {
  const fake = createFakeDevice(options);
  let clock = 0;
  const rpc = new ShellyBleRpc(fake.channel, {
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
  });
  const join = { sleep: async (ms: number) => void (clock += ms), now: () => clock, pollIntervalMs: 2_000 };
  return { fake, rpc, join };
}

async function params(rpc: ShellyBleRpc, over: Partial<SetupParams> = {}): Promise<SetupParams> {
  return {
    info: await getDeviceInfo(rpc),
    adminPassword: ADMIN_PW,
    wifi: { ssid: 'Workshop', password: WIFI_PW },
    name: 'Pro 1PM',
    disableBluetooth: true,
    register: vi.fn().mockResolvedValue({}),
    ...over,
  };
}

describe('scanWifi', () => {
  it('sorts by signal, keeps the strongest per SSID and marks open networks', async () => {
    const { rpc } = setup({
      networks: [
        { ssid: 'Weak', rssi: -80, auth: 3 },
        { ssid: 'Guest', rssi: -50, auth: 0 },
        { ssid: 'Weak', rssi: -60, auth: 3 },
        { ssid: '', rssi: -10, auth: 3 },
      ],
    });
    expect(await scanWifi(rpc)).toEqual([
      { ssid: 'Guest', rssi: -50, secured: false },
      { ssid: 'Weak', rssi: -60, secured: true },
    ]);
  });
});

describe('runSetup', () => {
  it('sets the admin password (ha1) before Wi-Fi, then registers and switches Bluetooth off', async () => {
    const { fake, rpc, join } = setup({ connectingPolls: 2 });
    const p = await params(rpc);
    const steps: string[] = [];
    const outcome = await runSetup(rpc, p, { join, onStep: (s, status) => steps.push(`${s}:${status}`) });

    expect(outcome).toEqual({
      restartRequired: false,
      ipAddress: '192.168.1.57',
      alreadyRegistered: false,
      bluetooth: 'off',
    });
    const methods = fake.requests.map((r) => r.method);
    expect(methods.indexOf('Shelly.SetAuth')).toBeLessThan(methods.indexOf('WiFi.SetConfig'));
    const setAuth = fake.requests.find((r) => r.method === 'Shelly.SetAuth');
    expect(setAuth?.params).toEqual({
      user: 'admin',
      realm: FAKE_DEVICE_ID,
      ha1: sha(`admin:${FAKE_DEVICE_ID}:${ADMIN_PW}`),
    });
    expect(fake.state.wifi).toEqual({ ssid: 'Workshop', pass: WIFI_PW, is_open: false, enable: true });
    expect(fake.state.bleEnabled).toBe(false);
    expect(p.register).toHaveBeenCalledWith({ ipAddress: '192.168.1.57', name: 'Pro 1PM' });
    expect(steps).toEqual([
      'password:running',
      'password:done',
      'wifi:running',
      'wifi:done',
      'join:running',
      'join:done',
      'register:running',
      'register:done',
      'bluetooth:running',
      'bluetooth:done',
    ]);
    // Calls after SetAuth were authenticated with digest auth.
    expect(fake.requests.filter((r) => r.method === 'WiFi.SetConfig').some((r) => r.auth)).toBe(true);
  });

  it('still works when BLE RPC does not enforce auth after SetAuth', async () => {
    const { fake, rpc, join } = setup({ openRpc: true });
    const outcome = await runSetup(rpc, await params(rpc), { join });
    expect(outcome.ipAddress).toBe('192.168.1.57');
    expect(fake.requests.every((r) => !r.auth)).toBe(true);
  });

  it('sends an open network without a password', async () => {
    const { fake, rpc, join } = setup();
    await runSetup(rpc, await params(rpc, { wifi: { ssid: 'Guest' } }), { join });
    expect(fake.state.wifi).toEqual({ ssid: 'Guest', is_open: true, enable: true });
  });

  it('keeps Bluetooth on when asked to', async () => {
    const { fake, rpc, join } = setup();
    const outcome = await runSetup(rpc, await params(rpc, { disableBluetooth: false }), { join });
    expect(outcome.bluetooth).toBe('left-on');
    expect(fake.requests.some((r) => r.method === 'BLE.SetConfig')).toBe(false);
  });

  it('asks a protected device for its current password and skips SetAuth', async () => {
    const { fake, rpc, join } = setup({ authEn: true, ha1: sha(`admin:${FAKE_DEVICE_ID}:current-pw`) });
    const p = await params(rpc, { adminPassword: 'current-pw' });
    expect(p.info.auth_en).toBe(true);
    const outcome = await runSetup(rpc, p, { join });
    expect(outcome.ipAddress).toBe('192.168.1.57');
    expect(fake.requests.some((r) => r.method === 'Shelly.SetAuth')).toBe(false);
  });

  it('fails with a wrong-password error before changing anything', async () => {
    const { fake, rpc, join } = setup({ authEn: true, ha1: sha(`admin:${FAKE_DEVICE_ID}:right`) });
    const err = await runSetup(rpc, await params(rpc, { adminPassword: 'wrong-pw-789' }), { join }).catch((e) => e);
    expect(err).toBeInstanceOf(SetupStepError);
    expect(err.step).toBe('password');
    expect(err.cause).toMatchObject({ kind: 'wrongPassword' });
    expect(fake.requests.some((r) => r.method === 'WiFi.SetConfig')).toBe(false);
    expect(JSON.stringify([err.message, err.data, err.cause.message])).not.toContain('wrong-pw-789');
  });

  it('reboots and stops on restart_required, leaving Bluetooth on and registering nothing', async () => {
    const { fake, rpc, join } = setup({ restartRequiredOnWifi: true, rebootSilent: true });
    const p = await params(rpc);
    const outcome = await runSetup(rpc, p, { join });
    expect(outcome).toEqual({ restartRequired: true, alreadyRegistered: false, bluetooth: 'left-on' });
    expect(fake.state.rebooted).toBe(true);
    expect(p.register).not.toHaveBeenCalled();
  });

  it('names the join step and last status on timeout', async () => {
    const { rpc, join } = setup({ neverJoins: true });
    const err = await runSetup(rpc, await params(rpc), { join }).catch((e) => e);
    expect(err).toBeInstanceOf(SetupStepError);
    expect(err.step).toBe('join');
    expect(err.data).toEqual({ status: 'connecting' });
  });

  it('treats a 409 as already registered and still switches Bluetooth off', async () => {
    const { fake, rpc, join } = setup();
    const register = vi.fn().mockRejectedValue(Object.assign(new Error('exists'), { status: 409 }));
    const outcome = await runSetup(rpc, await params(rpc, { register }), { join });
    expect(outcome).toMatchObject({ alreadyRegistered: true, bluetooth: 'off' });
    expect(fake.state.bleEnabled).toBe(false);
  });

  it('fails the register step on any other error', async () => {
    const { rpc, join } = setup();
    const register = vi.fn().mockRejectedValue(new Error('boom'));
    const err = await runSetup(rpc, await params(rpc, { register }), { join }).catch((e) => e);
    expect(err).toMatchObject({ step: 'register' });
  });

  it('never hands a secret to register()', async () => {
    const { rpc, join } = setup();
    const p = await params(rpc);
    await runSetup(rpc, p, { join });
    const sent = JSON.stringify(vi.mocked(p.register).mock.calls);
    expect(sent).not.toContain(WIFI_PW);
    expect(sent).not.toContain(ADMIN_PW);
  });

  it('keeps the secrets out of a failing WiFi.SetConfig or Shelly.SetAuth', async () => {
    for (const method of ['Shelly.SetAuth', 'WiFi.SetConfig']) {
      const { rpc, join } = setup({ failMethod: { method, message: 'Invalid argument' } });
      const err = await runSetup(rpc, await params(rpc), { join }).catch((e) => e);
      expect(err).toBeInstanceOf(SetupStepError);
      const text = [err.message, JSON.stringify(err.data), err.cause.message, JSON.stringify(err.cause)].join('|');
      expect(text).not.toContain(WIFI_PW);
      expect(text).not.toContain(ADMIN_PW);
      expect(text).toContain('Invalid argument');
    }
  });
});

describe('waitForIp', () => {
  it('times out after the given period', async () => {
    const { rpc, join } = setup({ neverJoins: true });
    await expect(waitForIp(rpc, { ...join, timeoutMs: 10_000 })).rejects.toMatchObject({ lastStatus: 'connecting' });
  });
});

describe('disableBluetooth', () => {
  it('disables without a reboot when none is needed', async () => {
    const { fake, rpc } = setup();
    expect(await disableBluetooth(rpc)).toBe('off');
    expect(fake.state.rebooted).toBe(false);
  });

  it('reboots when restart_required, and a reply lost to the reboot counts as success', async () => {
    const { fake, rpc } = setup({ bleSetConfig: 'restart', rebootSilent: true });
    expect(await disableBluetooth(rpc)).toBe('off');
    expect(fake.state.rebooted).toBe(true);
  });

  it('reports a refusal instead of throwing', async () => {
    const { fake, rpc } = setup({ bleSetConfig: 'refuse' });
    expect(await disableBluetooth(rpc)).toBe('refused');
    expect(fake.state.bleEnabled).toBe(true);
  });
});
