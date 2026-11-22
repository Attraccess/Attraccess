// The setup steps run over an RPC connection. Nothing here stores, logs or
// returns the Wi-Fi or admin password beyond handing it to the device.
import { computeHa1 } from './digest';
import { SetupStepError, type SetupStep } from './errors';
import type { RpcCaller, ShellyBleRpc } from './rpc';

export const ADMIN_USERNAME = 'admin';

export interface BleDeviceInfo {
  id: string;
  model?: string;
  gen?: number;
  fw_id?: string;
  ver?: string;
  mac?: string;
  auth_en?: boolean;
}

export interface WifiNetwork {
  ssid: string;
  rssi: number;
  secured: boolean;
}

export interface WifiChoice {
  ssid: string;
  /** Undefined for an open network. */
  password?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function getDeviceInfo(rpc: RpcCaller): Promise<BleDeviceInfo> {
  return rpc.call<BleDeviceInfo>('Shelly.GetDeviceInfo');
}

/** Networks the device sees, strongest first, one entry per SSID, hidden ones dropped. */
export async function scanWifi(rpc: RpcCaller): Promise<WifiNetwork[]> {
  const reply = await rpc.call<{ results?: Array<{ ssid?: string; rssi?: number; auth?: number }> }>(
    'WiFi.Scan',
    undefined,
    { timeoutMs: 45_000 },
  );
  const best = new Map<string, WifiNetwork>();
  for (const entry of reply?.results ?? []) {
    if (!entry.ssid) continue;
    const network = { ssid: entry.ssid, rssi: entry.rssi ?? -100, secured: (entry.auth ?? 0) !== 0 };
    const known = best.get(network.ssid);
    if (!known || known.rssi < network.rssi) best.set(network.ssid, network);
  }
  return [...best.values()].sort((a, b) => b.rssi - a.rssi);
}

/** Sets the admin password with the ha1 computed here; the plain password never leaves the browser. */
export async function setAdminPassword(rpc: ShellyBleRpc, info: BleDeviceInfo, password: string): Promise<void> {
  const ha1 = await computeHa1(ADMIN_USERNAME, info.id, password);
  await rpc.call('Shelly.SetAuth', { user: ADMIN_USERNAME, realm: info.id, ha1 });
  rpc.setCredentials(ADMIN_USERNAME, password);
}

/** Returns true when the device wants a reboot before the config applies. */
export async function configureWifi(rpc: RpcCaller, wifi: WifiChoice): Promise<boolean> {
  const sta = wifi.password
    ? { ssid: wifi.ssid, pass: wifi.password, is_open: false, enable: true }
    : { ssid: wifi.ssid, is_open: true, enable: true };
  const result = await rpc.call<{ restart_required?: boolean }>('WiFi.SetConfig', { config: { sta } });
  return Boolean(result?.restart_required);
}

export interface JoinOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class JoinTimeoutError extends Error {
  constructor(public readonly lastStatus: string) {
    super(`The device did not get an IP address (last status: ${lastStatus})`);
    this.name = 'JoinTimeoutError';
  }
}

export async function waitForIp(rpc: RpcCaller, options: JoinOptions = {}): Promise<string> {
  const { timeoutMs = 60_000, pollIntervalMs = 2_000, sleep = defaultSleep, now = Date.now } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    const wifi = await rpc.call<{ status?: string; sta_ip?: string | null }>('WiFi.GetStatus');
    const lastStatus = wifi?.status ?? 'unknown';
    if (lastStatus === 'got ip' && wifi?.sta_ip) return wifi.sta_ip;
    if (now() >= deadline) throw new JoinTimeoutError(lastStatus);
    await sleep(pollIntervalMs);
  }
}

/** The device may reboot before it answers, so a lost reply is success. */
async function reboot(rpc: RpcCaller): Promise<void> {
  await rpc.call('Shelly.Reboot', undefined, { timeoutMs: 3_000 }).catch(() => undefined);
}

export type BluetoothOffResult = 'off' | 'refused';

/** Switches the radio off. A refusal is reported, not thrown: the device is registered already. */
export async function disableBluetooth(rpc: RpcCaller): Promise<BluetoothOffResult> {
  try {
    const result = await rpc.call<{ restart_required?: boolean }>('BLE.SetConfig', { config: { enable: false } });
    if (result?.restart_required) {
      // The reply may never arrive, the link dies as the device reboots.
      await reboot(rpc);
    }
    return 'off';
  } catch {
    return 'refused';
  }
}

export interface SetupParams {
  info: BleDeviceInfo;
  /** New password, or the current one when `info.auth_en` is true. */
  adminPassword: string;
  wifi: WifiChoice;
  name: string;
  disableBluetooth: boolean;
  /** Registers the device with Attraccess. Receives the address and name only. */
  register: (input: { ipAddress: string; name: string }) => Promise<unknown>;
}

export interface SetupCallbacks {
  onStep?: (step: SetupStep, status: 'running' | 'done' | 'skipped') => void;
  join?: JoinOptions;
}

export interface SetupOutcome {
  /** The device must restart first; it is not in the registry yet. */
  restartRequired: boolean;
  ipAddress?: string;
  /** The IP was already in the registry (HTTP 409). */
  alreadyRegistered: boolean;
  bluetooth: 'off' | 'left-on' | 'refused';
}

function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 409;
}

async function step<T>(
  name: SetupStep,
  callbacks: SetupCallbacks,
  action: () => Promise<T>,
  detail?: (err: unknown) => Record<string, string | number>,
): Promise<T> {
  callbacks.onStep?.(name, 'running');
  try {
    const result = await action();
    callbacks.onStep?.(name, 'done');
    return result;
  } catch (err) {
    throw new SetupStepError(name, err, detail?.(err));
  }
}

export async function runSetup(
  rpc: ShellyBleRpc,
  params: SetupParams,
  callbacks: SetupCallbacks = {},
): Promise<SetupOutcome> {
  const { info, wifi } = params;

  if (info.auth_en) {
    // The device is protected already: authenticate with its current password.
    // A cheap protected call proves the password before anything is changed.
    rpc.setCredentials(ADMIN_USERNAME, params.adminPassword);
    await step('password', callbacks, () => rpc.call('Sys.GetConfig'));
  } else {
    // Before Wi-Fi, so the device is never on the network unprotected.
    await step('password', callbacks, () => setAdminPassword(rpc, info, params.adminPassword));
  }

  const restartRequired = await step('wifi', callbacks, () => configureWifi(rpc, wifi));
  if (restartRequired) {
    await reboot(rpc);
    return { restartRequired: true, alreadyRegistered: false, bluetooth: 'left-on' };
  }

  const ipAddress = await step(
    'join',
    callbacks,
    () => waitForIp(rpc, callbacks.join),
    (err): Record<string, string | number> => (err instanceof JoinTimeoutError ? { status: err.lastStatus } : {}),
  );

  let alreadyRegistered = false;
  await step('register', callbacks, async () => {
    try {
      await params.register({ ipAddress, name: params.name });
    } catch (err) {
      if (!isConflict(err)) throw err;
      alreadyRegistered = true;
    }
  });

  let bluetooth: SetupOutcome['bluetooth'] = 'left-on';
  if (params.disableBluetooth) {
    bluetooth = await step('bluetooth', callbacks, () => disableBluetooth(rpc)).then((r) =>
      r === 'off' ? 'off' : 'refused',
    );
  } else {
    callbacks.onStep?.('bluetooth', 'skipped');
  }
  return { restartRequired: false, ipAddress, alreadyRegistered, bluetooth };
}
