import { PageHeader } from '../../../components/pageHeader';
import { UserSearch, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ManualTransactionsCard } from './manualTransactions';
import { useState } from 'react';
import { User } from '@attraccess/react-query-client';
import { Button, Card, CardContent, CardHeader, Link } from '@heroui/react';
import { SummaryCard } from '../dashboard/summary';
import { SumUpIcon } from '../../../components/icons/sumup.icon';
import { BanknoteIcon } from 'lucide-react';
import { ManageBillingFactorCard } from './billingFactor';

export function BillingAdministrationPage() {
  const { t } = useTranslations({ en, de });

  const [user, setUser] = useState<User | null>(null);

  return (
    <>
      <PageHeader
        title={t('title')}
        icon={<BanknoteIcon />}
        actions={
          <Button variant="ghost" as={Link} href="/billing/administration/sumup"><SumUpIcon />
            {t('actions.sumupSettings')}
          </Button>
        }
        backTo="/billing"
      />

      <div className="flex flex-row flex-wrap gap-4">
        <Card className="flex-grow">
          <CardHeader>
            <PageHeader title={t('inputs.user')} noMargin />
          </CardHeader>
          <CardContent>
            <UserSearch onSelectionChange={setUser} label={t('inputs.user')} />
          </CardContent>
        </Card>

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
