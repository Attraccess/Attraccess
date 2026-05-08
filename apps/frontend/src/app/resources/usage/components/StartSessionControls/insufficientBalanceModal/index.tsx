import { useTranslations } from '@attraccess/plugins-frontend-ui';

import { Modal, ModalContent } from '../../../../../../utils/heroui-compat';
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
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalContent>
        <BillingDashboardTopupCard
          title={t('title')}
          subtitle={t('description')}
          desiredAmount={desiredAmount}
          onProcessingComplete={onClose}
        />
      </ModalContent>
    </Modal>
  );
}
