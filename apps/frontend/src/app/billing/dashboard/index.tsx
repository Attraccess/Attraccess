import { PageHeader } from '../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ChartNoAxesCombinedIcon, Settings2Icon } from 'lucide-react';
import { SummaryCard } from './summary';
import { BillingDashboardTopupCard } from './topup';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export function BillingDashboardPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  const { hasPermission } = useAuth();

  return (
    <div>
      <PageHeader
        title={t('title')}
        icon={<ChartNoAxesCombinedIcon />}
        actions={[
          {
            key: 'administration',
            label: t('actions.administration'),
            icon: <Settings2Icon />,
            isHidden: !hasPermission('canManageBilling'),
            onPress: () => navigate('/billing/administration'),
          },
        ]}
      />

      <div className="flex flex-row flex-wrap gap-4">
        <BillingDashboardTopupCard className="flex-grow" />
        <SummaryCard transactionsPerPage={15} className="flex-grow" />
      </div>
    </div>
  );
}
