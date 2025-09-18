import { PageHeader } from '../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ChartNoAxesCombinedIcon } from 'lucide-react';
import { SummaryCard } from './summary';
import { BillingDashboardTopupCard } from './topup';

export function BillingDashboardPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} icon={<ChartNoAxesCombinedIcon />} />

      <div className="flex flex-row flex-wrap gap-4">
        <BillingDashboardTopupCard className="flex-grow" />
        <SummaryCard transactionsPerPage={15} className="flex-grow" />
      </div>
    </div>
  );
}
