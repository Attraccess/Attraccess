import { useTranslations } from '@attraccess/plugins-frontend-ui';

import { Modal, ModalBackdrop, ModalContainer, ModalDialog } from '@heroui/react';
import en from './en.json';
import de from './de.json';
import { BillingDashboardTopupCard } from '../../../../../billing/dashboard/topup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  desiredAmount?: number;
}

export function InsufficientBalanceModal(props: Props) {
  const { isOpen, onClose, desiredAmount } = props;

  const { t } = useTranslations({ en, de });

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop />
      <ModalContainer>
        <ModalDialog>
          {() => (
            <BillingDashboardTopupCard
              title={t('title')}
              subtitle={t('description')}
              desiredAmount={desiredAmount}
              onProcessingComplete={onClose}
            />
          )}
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
}
