import type { CommissioningSession, WagoCommissioningState, WagoController } from '../api/client';

export const cellClass = 'wg:whitespace-nowrap wg:align-middle';

export const PAGE_SIZE = 25;

export interface ControllersTableProps {
  controllers: WagoController[];
  sessions: CommissioningSession[];
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
}

export type TableRowData =
  | { key: string; kind: 'controller'; controller: WagoController; session: CommissioningSession | null }
  | { key: string; kind: 'session'; session: CommissioningSession };

export function isResumable(state: WagoCommissioningState): boolean {
  return [
    'awaiting_delivery',
    'delivering',
    'awaiting_identity_confirmation',
    'awaiting_codesys_confirmation',
    'delivery_failed',
  ].includes(state);
}
