import type { EngineeringUnit } from '../measurement-contract';
import { CONFIGURATION_PROTOCOL_VERSION } from './protocol';
import type { ModbusConfiguration } from '../modbus/model';
import type { ModbusPoint } from '../modbus/model';
import { HARDWARE_PROFILES } from './configuration.hardware-profiles';
import { CHANNEL_PROFILES } from './configuration.state';
import { CAPABILITIES } from './configuration.state';
import { WAGO_PRESETS } from './configuration.state';
export interface ConfigurationValidationError {
  path: string;
  code: string;
  message: string;
}

export interface WagoConfigurationReport {
  revision: number;
  contentHash: string;
  errors: ConfigurationValidationError[];
}

export interface WagoConfigurationSnapshot {
  version: typeof CONFIGURATION_PROTOCOL_VERSION;
  modbus?: ModbusConfiguration;
  physicalPoints: Array<{
    id: string;
    hardwareProfile: (typeof HARDWARE_PROFILES)[number];
    channel: number;
    modbus?: ModbusPoint;
  }>;
  logicalChannels: Array<{
    id: string;
    physicalPointId: string;
    profile: (typeof CHANNEL_PROFILES)[number];
    capabilities: Array<(typeof CAPABILITIES)[number]>;
    invert?: boolean;
    disconnectPolicy: { mode: 'hold' | 'immediate' | 'watchdog'; timeoutMs?: number };
    range?: { minimum: number; maximum: number };
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    feedback?: { channelId: string; expected: 'match' | 'inverse'; timeoutMs: number };
    measurement?: {
      unit: EngineeringUnit;
      scale: number;
      offset: number;
      kind?: 'live' | 'cumulative';
    };
  }>;
}

export type WagoPresetId = (typeof WAGO_PRESETS)[number]['id'];

export interface WagoPresetApplication {
  presetId: WagoPresetId;
  channelId: string;
  physicalPointId: string;
  guardChannelId?: string;
  feedbackChannelId?: string;
}
