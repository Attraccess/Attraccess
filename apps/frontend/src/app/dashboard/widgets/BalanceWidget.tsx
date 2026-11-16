import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { useCreditsFormatter } from '../../../hooks/useCreditsFormatter';
import { WidgetActions, WidgetError, WidgetLinkButton, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

/** The user's own credit balance, formatted like on the billing page. */
export function BalanceWidget() {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const configuration = useBillingServiceGetBillingConfiguration();
  const balance = useBillingServiceGetBillingBalance({ userId: user?.id ?? 0 }, undefined, { enabled: !!user });
  const formatCredits = useCreditsFormatter(configuration.data?.minorUnit ?? 2);

  const renderBalance = () => {
    if (configuration.isError || balance.isError) return <WidgetError title={t('loadError')} />;
    if (!configuration.data || !balance.data) return <WidgetLoading />;
    return (
      <p className="text-2xl font-bold" data-cy="dashboard-balance-value">
        {t('billing-balance.balance', {
          balance: formatCredits(balance.data.value),
          currency: configuration.data.currency,
        })}
      </p>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {renderBalance()}
      <WidgetActions>
        <WidgetLinkButton href="/billing" data-cy="dashboard-balance-top-up">
          {t('billing-balance.topUp')}
        </WidgetLinkButton>
        <WidgetLinkButton href="/billing" data-cy="dashboard-balance-transactions">
          {t('billing-balance.transactions')}
        </WidgetLinkButton>
      </WidgetActions>
    </div>
  );
}
