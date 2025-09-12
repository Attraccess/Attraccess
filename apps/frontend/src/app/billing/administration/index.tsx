import { PageHeader } from '../../../components/pageHeader';
import { BanknoteIcon } from 'lucide-react';
import { UserSearch, useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './en.json';
import * as de from './de.json';
import { ManualTransactionsCard } from './manualTransactions';
import { useState } from 'react';
import { User } from '@attraccess/react-query-client';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { SummaryCard } from '../dashboard/summary';

export function BillingAdministrationPage() {
  const { t } = useTranslations('billingAdministration', { en, de });

  const [user, setUser] = useState<User | null>(null);

  return (
    <>
      <PageHeader title={t('title')} icon={<BanknoteIcon />} />

      <Card className="w-full mb-4">
        <CardHeader>
          <PageHeader title={t('inputs.user')} noMargin />
        </CardHeader>
        <CardBody>
          <UserSearch onSelectionChange={setUser} label={t('inputs.user')} />
        </CardBody>
      </Card>

      <div className="flex flex-row flex-wrap gap-4">
        <ManualTransactionsCard userId={user?.id as number} className="flex-grow" />
        <SummaryCard userId={user?.id as number} isDisabled={!user} className="flex-grow" />
      </div>
    </>
  );
}
