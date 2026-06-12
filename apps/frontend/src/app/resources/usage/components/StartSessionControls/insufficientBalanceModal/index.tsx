import { useTranslations } from '@attraccess/plugins-frontend-ui';

import en from './en.json';
import de from './de.json';
import { BillingDashboardTopupCard } from '../../../../../billing/dashboard/topup';
import { StandardModal } from '../../../../../../components/standardModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  desiredAmount?: number;
}

export function InsufficientBalanceModal(props: Props) {
  const { isOpen, onClose, desiredAmount } = props;

  const { t } = useTranslations({ en, de });

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
    >
      {() => (
        <BillingDashboardTopupCard
          title={t('title')}
          subtitle={t('description')}
          desiredAmount={desiredAmount}
          onProcessingComplete={onClose}
        />
      )}
    </StandardModal>
  );
}
