import type { CommissioningSession } from './api';
import type { useCommissioning } from './CommissioningModal.use-commissioning.helpers';

export interface CommissioningModalProps {
  isOpen: boolean;
  session: CommissioningSession | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfigure?: (controllerId: number) => void;
}

export type CommissioningModel = ReturnType<typeof useCommissioning>;
