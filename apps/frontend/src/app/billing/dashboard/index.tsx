import { PageHeader } from '../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './en.json';
import * as de from './de.json';
import { ChartNoAxesCombinedIcon } from 'lucide-react';
import { SummaryCard } from './summary';

export function BillingDashboardPage() {
  const { t } = useTranslations('billingDashboard', { en, de });

  return (
    <div>
      <PageHeader title={t('title')} icon={<ChartNoAxesCombinedIcon />} />

      <div className="flex flex-row flex-wrap gap-4">
        <SummaryCard className="flex-grow" transactionsPerPage={15} />
      </div>
    </div>
  );
}
