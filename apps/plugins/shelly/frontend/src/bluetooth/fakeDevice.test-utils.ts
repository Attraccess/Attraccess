// A stateful fake Shelly Pro 1PM on top of the framing fake: it enforces
// digest auth once an admin password is set (answering 401 with a challenge)
// and implements the methods the setup uses. Test support only.
import {
  challengeError,
  createFakeShelly,
  verifyDigest,
  type FakeReply,
  type FakeShelly,
} from './fakeShelly.test-utils';

export interface FakeDeviceOptions {
  authEn?: boolean;
  /** Existing ha1 when `authEn` is set. */
  ha1?: string;
  /** BLE RPC answers every call unauthenticated, even after SetAuth. */
  openRpc?: boolean;
  networks?: Array<{ ssid: string; rssi: number; auth: number }>;
  scanError?: boolean;
  /** WiFi.GetStatus answers "connecting" this many times before "got ip". */
  connectingPolls?: number;
  neverJoins?: boolean;
  staIp?: string;
  restartRequiredOnWifi?: boolean;
  bleSetConfig?: 'ok' | 'restart' | 'refuse';
  /** Shelly.Reboot never answers, like a device that reboots first. */
  rebootSilent?: boolean;
  /** Fail an RPC with a device error. */
  failMethod?: { method: string; message: string };
}

export interface FakeDevice extends FakeShelly {
  state: { ha1?: string; wifi?: Record<string, unknown>; bleEnabled: boolean; rebooted: boolean };
}

export const FAKE_DEVICE_ID = 'shellypro1pm-a0b1c2d3e4f5';

export function createFakeDevice(options: FakeDeviceOptions = {}): FakeDevice {
  const state: FakeDevice['state'] = {
    ha1: options.authEn ? options.ha1 : undefined,
    bleEnabled: true,
    rebooted: false,
  };
  let connecting = options.connectingPolls ?? 0;

  const fake = createFakeShelly(async (req): Promise<FakeReply> => {
    if (options.failMethod?.method === req.method) {
      return { error: { code: -103, message: options.failMethod.message } };
    }
    if (req.method !== 'Shelly.GetDeviceInfo' && state.ha1 && !options.openRpc) {
      if (!(await verifyDigest(req.auth, state.ha1))) return challengeError(FAKE_DEVICE_ID);
    }
    switch (req.method) {
      case 'Shelly.GetDeviceInfo':
        return {
          result: {
            id: FAKE_DEVICE_ID,
            mac: 'A0B1C2D3E4F5',
            model: 'SPSW-201PE16EU',
            gen: 2,
            fw_id: '20240101-000000/1.4.4',
            ver: '1.4.4',
            app: 'Pro1PM',
            auth_en: Boolean(state.ha1),
          },
        };
      case 'Shelly.SetAuth':
        state.ha1 = String(req.params?.ha1);
        return { result: null };
      case 'Sys.GetConfig':
        return { result: { device: { name: null } } };
      case 'WiFi.Scan':
        if (options.scanError) return { error: { code: -114, message: 'scan failed' } };
        return { result: { results: options.networks ?? [] } };
      case 'WiFi.SetConfig':
        state.wifi = (req.params?.config as { sta: Record<string, unknown> }).sta;
        return { result: { restart_required: Boolean(options.restartRequiredOnWifi) } };
      case 'WiFi.GetStatus':
        if (options.neverJoins || connecting-- > 0) return { result: { status: 'connecting', sta_ip: null } };
        return { result: { status: 'got ip', sta_ip: options.staIp ?? '192.168.1.57', ssid: state.wifi?.ssid } };
      case 'BLE.SetConfig':
        if (options.bleSetConfig === 'refuse') return { error: { code: -105, message: 'BLE config is locked' } };
        state.bleEnabled = false;
        return { result: { restart_required: options.bleSetConfig === 'restart' } };
      case 'Shelly.Reboot':
        state.rebooted = true;
        return options.rebootSilent ? 'silence' : { result: null };
      default:
        return { error: { code: 404, message: `No handler for ${req.method}` } };
    }
  });
  return Object.assign(fake, { state });
}
