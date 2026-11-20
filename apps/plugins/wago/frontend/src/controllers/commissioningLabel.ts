import type { TFunction } from '@attraccess/plugins-frontend-ui';
import type { WagoCommissioningState } from '../api/client';
import en from '../en.json';

export function commissioningLabel(state: WagoCommissioningState, t?: TFunction): string {
  return t ? t(`commissioning.${state}`) : en.commissioning[state];
}
