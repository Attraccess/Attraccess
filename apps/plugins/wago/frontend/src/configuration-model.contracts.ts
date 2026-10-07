import type { WagoConfigurationSnapshot } from './api';
import type { ModbusConfiguration } from '../../modbus/model';
import type { ModbusProfile } from '../../modbus/model';

export type Channel = WagoConfigurationSnapshot['logicalChannels'][number];

export type PhysicalPoint = WagoConfigurationSnapshot['physicalPoints'][number];

export type ValueContext = {
  modbus?: ModbusConfiguration;
  profile?: ModbusProfile;
  translateName: (name: string) => string;
  metadataNames: Record<string, string>;
};
