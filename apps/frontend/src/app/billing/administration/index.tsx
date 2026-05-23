import { PageHeader } from '../../../components/pageHeader';
import { UserSearch, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ManualTransactionsCard } from './manualTransactions';
import { useState } from 'react';
import { User } from '@attraccess/react-query-client';
import { useNavigate } from 'react-router-dom';
import { SummaryCard } from '../dashboard/summary';
import { SumUpIcon } from '../../../components/icons/sumup.icon';
import { BanknoteIcon } from 'lucide-react';
import { ManageBillingFactorCard } from './billingFactor';

export function BillingAdministrationPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);

  return (
    <>
      <PageHeader
        title={t('title')}
        icon={<BanknoteIcon />}
        actions={[
          {
            key: 'sumup-settings',
            label: t('actions.sumupSettings'),
            icon: <SumUpIcon />,
            onPress: () => navigate('/billing/administration/sumup'),
          },
        ]}
        backTo="/billing"
      />

      <div className="flex flex-row flex-wrap gap-4">
        <section className="flex-grow w-full flex flex-col gap-4">
          <PageHeader title={t('inputs.user')} noMargin />
          <UserSearch onSelectionChange={setUser} />
        </section>

        {user && (
          <>
            <ManageBillingFactorCard userId={user?.id as number} className="flex-grow" />
            <ManualTransactionsCard userId={user?.id as number} className="flex-grow" />
            <SummaryCard userId={user?.id as number} isDisabled={!user} className="w-full" />
          </>
        )}
      </div>
    </>
  );
}
