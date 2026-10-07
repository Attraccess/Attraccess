import type { WagoDiagnostics } from '../../../diagnostics-types';
import { type Channel, type PanelConfiguration } from './model';

export interface LiveControls {
  applied: PanelConfiguration | null;
  diagnostics?: WagoDiagnostics;
  busy: boolean;
  enabled: boolean;
  command: (channel: Channel, value?: boolean) => void;
}
