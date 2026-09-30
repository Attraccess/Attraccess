// PROTOTYPE — throwaway. In-memory mock of a CC100 I/O model + simulated live values. Wipe me.
// Question: what should naming/configuring I/O + Modbus devices + live preview/control look like?
import { useEffect, useSyncExternalStore } from 'react';
import { BUILTIN_MODBUS_PROFILES, type ModbusProfile } from '../../../modbus/model';

export type OnDisconnect = 'off' | 'hold' | 'timeout';
export interface Output {
  terminal: string; // DO1..DO4
  name: string; // empty = unused
  mode: 'switch' | 'pulse';
  pulseMs: number;
  onDisconnect: OnDisconnect;
  timeoutMs: number;
}
export interface Input {
  terminal: string; // DI1..DI8
  name: string;
  invert: boolean;
}
export type Link = { kind: 'rs485'; unitId: number } | { kind: 'tcp'; host: string; port: number; unitId: number };
export interface Device {
  id: string;
  name: string;
  profileId: string;
  link: Link;
  pollMs: number;
}
export interface Bus {
  baudRate: number;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
}
export interface Config {
  outputs: Output[];
  inputs: Input[];
  devices: Device[];
  customProfiles: ModbusProfile[];
  bus: Bus;
}
export interface Live {
  di: Record<string, boolean>;
  do: Record<string, boolean>;
  modbus: Record<string, number | null>; // `${deviceId}/${pointId}`
  deviceOnline: Record<string, boolean>;
  overrides: string[]; // outputs manually controlled from the UI
}

const relayProfile: ModbusProfile = {
  id: 'custom-relay-4ch',
  name: '4-ch relay module (custom)',
  version: 1,
  measurements: [
    {
      id: 'temp',
      name: 'Board temperature',
      address: 0,
      addressBase: 0,
      dataType: 'int16',
      byteOrder: 'big',
      wordOrder: 'big',
      scale: 0.1,
      offset: 0,
      functionCode: 4,
      unit: 'percent',
      kind: 'live',
      pollIntervalMs: 2000,
    },
  ],
  actions: [1, 2, 3, 4].map((n) => ({
    id: `relay-${n}`,
    name: `Relay ${n}`,
    address: n - 1,
    addressBase: 0 as const,
    dataType: 'uint16' as const,
    byteOrder: 'big' as const,
    wordOrder: 'big' as const,
    scale: 1,
    offset: 0,
    functionCode: 5 as const,
    onValue: 1,
    offValue: 0,
  })),
};

const initial: Config = {
  outputs: [1, 2, 3, 4].map((n) => ({
    terminal: `DO${n}`,
    name: ({ 1: 'Laser cutter power', 2: 'Door lock' } as Record<number, string>)[n] ?? '',
    mode: n === 2 ? 'pulse' : 'switch',
    pulseMs: 3000,
    onDisconnect: n === 2 ? 'off' : 'timeout',
    timeoutMs: 30000,
  })),
  inputs: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    terminal: `DI${n}`,
    name: ({ 1: 'Lid closed', 2: 'Emergency stop OK', 3: 'Exhaust running' } as Record<number, string>)[n] ?? '',
    invert: false,
  })),
  devices: [
    { id: 'dev-1', name: 'Laser meter', profileId: 'wago-879-3000', link: { kind: 'rs485', unitId: 1 }, pollMs: 5000 },
    { id: 'dev-2', name: 'Wall relays', profileId: 'custom-relay-4ch', link: { kind: 'tcp', host: '192.168.1.50', port: 502, unitId: 1 }, pollMs: 2000 },
    { id: 'dev-3', name: 'CNC meter', profileId: 'wago-879-3000', link: { kind: 'rs485', unitId: 2 }, pollMs: 5000 },
  ],
  customProfiles: [relayProfile],
  bus: { baudRate: 9600, parity: 'even', stopBits: 1 },
};

let config: Config = structuredClone(initial);
let applied: Config = structuredClone(initial);
let live: Live = { di: {}, do: {}, modbus: {}, deviceOnline: { 'dev-1': true, 'dev-2': true, 'dev-3': false }, overrides: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export const allProfiles = () => [...BUILTIN_MODBUS_PROFILES, ...config.customProfiles];
export const profileOf = (d: Device) => allProfiles().find((p) => p.id === d.profileId);
export const isBuiltin = (id: string) => BUILTIN_MODBUS_PROFILES.some((p) => p.id === id);

export function useConfig() {
  return useSyncExternalStore(subscribe, () => config);
}
export function useDirty() {
  return useSyncExternalStore(subscribe, () => config !== applied && JSON.stringify(config) !== JSON.stringify(applied));
}
export function useLive() {
  return useSyncExternalStore(subscribe, () => live);
}
export function setConfig(fn: (c: Config) => Config) {
  config = fn(config);
  emit();
}
export function apply() {
  applied = structuredClone(config);
  emit();
}
export function discard() {
  config = structuredClone(applied);
  emit();
}
export const updateOutput = (terminal: string, patch: Partial<Output>) =>
  setConfig((c) => ({ ...c, outputs: c.outputs.map((o) => (o.terminal === terminal ? { ...o, ...patch } : o)) }));
export const updateInput = (terminal: string, patch: Partial<Input>) =>
  setConfig((c) => ({ ...c, inputs: c.inputs.map((i) => (i.terminal === terminal ? { ...i, ...patch } : i)) }));
export const updateDevice = (id: string, patch: Partial<Device>) =>
  setConfig((c) => ({ ...c, devices: c.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
export const removeDevice = (id: string) => setConfig((c) => ({ ...c, devices: c.devices.filter((d) => d.id !== id) }));
export function addDevice(profileId = 'wago-879-3000'): string {
  const id = `dev-${Date.now()}`;
  const used = config.devices.filter((d) => d.link.kind === 'rs485').map((d) => d.link.unitId);
  setConfig((c) => ({
    ...c,
    devices: [
      ...c.devices,
      { id, name: `Device ${c.devices.length + 1}`, profileId, link: { kind: 'rs485', unitId: Math.max(0, ...used) + 1 }, pollMs: 5000 },
    ],
  }));
  live = { ...live, deviceOnline: { ...live.deviceOnline, [id]: true } };
  return id;
}
export function upsertProfile(p: ModbusProfile) {
  setConfig((c) => ({ ...c, customProfiles: [...c.customProfiles.filter((x) => x.id !== p.id), p] }));
}

// Live control. Real impl: MQTT command → controller; only applied config is controllable.
export function setOutput(key: string, on: boolean) {
  const o = applied.outputs.find((x) => x.terminal === key);
  live = { ...live, do: { ...live.do, [key]: on }, overrides: [...new Set([...live.overrides, key])] };
  emit();
  if (o?.mode === 'pulse' && on) setTimeout(() => ((live = { ...live, do: { ...live.do, [key]: false } }), emit()), o.pulseMs);
}
export function setModbusAction(deviceId: string, actionId: string, on: boolean) {
  const key = `${deviceId}/${actionId}`;
  live = { ...live, modbus: { ...live.modbus, [key]: on ? 1 : 0 }, overrides: [...new Set([...live.overrides, key])] };
  emit();
}
export function releaseOverrides() {
  live = { ...live, overrides: [] };
  emit();
}

// ponytail: fake physics, just enough to make numbers move.
function tick() {
  const di = { ...live.di };
  for (const i of config.inputs) if (Math.random() < 0.08 || di[i.terminal] === undefined) di[i.terminal] = Math.random() < 0.5;
  const modbus = { ...live.modbus };
  for (const d of config.devices) {
    const p = profileOf(d);
    if (!p || !live.deviceOnline[d.id]) continue;
    for (const m of p.measurements) {
      const k = `${d.id}/${m.id}`;
      const prev = modbus[k] ?? 0;
      modbus[k] =
        m.unit === 'volt' ? 229 + Math.random() * 3
        : m.unit === 'ampere' ? 2 + Math.random() * 4
        : m.unit === 'watt' ? 400 + Math.random() * 900
        : m.unit === 'watt-hour' ? (prev || 12840000) + Math.random() * 3
        : 30 + Math.random() * 5;
    }
  }
  live = { ...live, di, modbus };
  emit();
}
export function useSimulation() {
  useEffect(() => {
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
}

export const fmt = (v: number | null | undefined, unit?: string) => {
  if (v === null || v === undefined) return '—';
  if (unit === 'watt-hour') return `${(v / 1000).toFixed(2)} kWh`;
  if (unit === 'watt') return v >= 1000 ? `${(v / 1000).toFixed(2)} kW` : `${v.toFixed(0)} W`;
  const u = { volt: 'V', ampere: 'A', percent: '%' }[unit ?? ''] ?? '';
  return `${v.toFixed(1)} ${u}`;
};
export const linkLabel = (l: Link) => (l.kind === 'rs485' ? `RS-485 · address ${l.unitId}` : `${l.host}:${l.port} · unit ${l.unitId}`);
export const disconnectLabel: Record<OnDisconnect, string> = {
  off: 'Turn off immediately',
  hold: 'Keep last state',
  timeout: 'Turn off after timeout',
};

