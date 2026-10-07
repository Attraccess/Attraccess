import { type WagoConfigurationDraft } from '../api';
import { type PanelConfiguration } from './model';

export interface WorkingCopy {
  configuration: PanelConfiguration;
  loadedDraft: WagoConfigurationDraft | null;
}
