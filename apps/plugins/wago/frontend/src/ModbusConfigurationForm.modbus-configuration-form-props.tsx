import { type ReactNode } from 'react';
import { type ModbusConfiguration } from '../../modbus/model';

export interface ModbusConfigurationFormProps {
  value: ModbusConfiguration;
  onChange: (value: ModbusConfiguration) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
  collapseProfiles?: boolean;
  showValidationErrors?: boolean;
  focused?: boolean;
  deviceChannels?: (deviceId: string) => ReactNode;
}
