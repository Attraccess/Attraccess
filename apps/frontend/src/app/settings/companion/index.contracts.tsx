import { CompanionDevice } from '@attraccess/react-query-client';
import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';

export type FormatDateTime = ReturnType<typeof useDateTimeFormatter>;

export interface DeviceRowProps {
  device: CompanionDevice;
  latestVersion: string | null;
  onRenameStart: (device: CompanionDevice) => void;
  onDeleteStart: (device: CompanionDevice) => void;
  t: (key: string) => string;
  formatDateTime: FormatDateTime;
}

export type DeviceWithConnected = CompanionDevice & { connected?: boolean };
