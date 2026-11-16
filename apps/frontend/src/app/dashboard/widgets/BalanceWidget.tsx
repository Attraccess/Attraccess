import { cn } from '@heroui/react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  BillingTransaction,
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransactions,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { useCreditsFormatter } from '../../../hooks/useCreditsFormatter';
import { BigNumber, WidgetEmpty, WidgetError, WidgetList, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const TRANSACTIONS = 3;

/** A short name for a transaction, by what caused it, like the billing page's details column. */
function transactionKey(transaction: BillingTransaction): { key: string; name?: string } {
  if (transaction.refundOfId) return { key: 'refund' };
  if (transaction.correctionOfId) return { key: 'correction' };
  const resourceName = transaction.resourceUsage?.resource?.name;
  if (transaction.resourceUsageId && resourceName) return { key: 'usage', name: resourceName };
  if (transaction.initiatorId) return { key: 'manual' };
  if (transaction.externalReference) return { key: 'topUp' };
  return { key: 'other' };
}

function LatestTransactions({
  userId,
  format,
}: Readonly<{ userId: number; format: (amount: number) => string }>) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const { data, isPending, isError } = useBillingServiceGetBillingTransactions({ userId, limit: TRANSACTIONS });

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (data.data.length === 0) return <WidgetEmpty>{t('billing-balance.noTransactions')}</WidgetEmpty>;
  return (
    <WidgetList>
      {data.data.slice(0, TRANSACTIONS).map((transaction) => {
        const { key, name } = transactionKey(transaction);
        return (
          <li key={transaction.id} className="flex min-w-0 items-center gap-2 text-xs" data-cy="dashboard-balance-transaction">
            <span className="shrink-0 text-muted">{formatDateTime(transaction.createdAt)}</span>
            <span className="min-w-0 flex-1 truncate">
              {t(`billing-balance.transaction.${key}`, { name })}
            </span>
            <span className={cn('shrink-0 tabular-nums', transaction.amount < 0 && 'text-danger')}>
              {format(transaction.amount)}
            </span>
          </li>
        );
      })}
    </WidgetList>
  );
}

/** The user's own credit balance, in the danger colour when negative; medium tiles add the latest transactions. */
export function BalanceWidget({ size }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const configuration = useBillingServiceGetBillingConfiguration();
  const balance = useBillingServiceGetBillingBalance({ userId: user?.id ?? 0 }, undefined, { enabled: !!user });
  const formatCredits = useCreditsFormatter(configuration.data?.minorUnit ?? 2);

  if (configuration.isError || balance.isError) return <WidgetError title={t('loadError')} />;
  if (!configuration.data || !balance.data || !user) return <WidgetLoading />;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BigNumber
        value={t('billing-balance.balance', {
          balance: formatCredits(balance.data.value),
          currency: configuration.data.currency,
        })}
        className={balance.data.value < 0 ? 'text-danger' : undefined}
        data-cy="dashboard-balance-value"
      />
      {size !== 'small' && <LatestTransactions userId={user.id} format={formatCredits} />}
    </div>
  );
}
