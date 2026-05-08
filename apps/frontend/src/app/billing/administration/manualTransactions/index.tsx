import { Button, Card, CardContent, CardFooter, CardHeader, CardProps, NumberInput } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { HandCoinsIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useState } from 'react';
import {
  useBillingServiceCreateManualTransaction,
  UseBillingServiceGetBillingBalanceKeyFn,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransactionsKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { userCurrencyToDbCurrency } from '@attraccess/shared';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

interface Props {
  userId?: number;
}

export function ManualTransactionsCard(props: Props & Omit<CardProps, 'children'>) {
  const { userId, ...cardProps } = props;
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  const [amount, setAmount] = useState<number>(0);

  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  const { mutate: createManualTransaction, isPending: isCreatingManualTransaction } =
    useBillingServiceCreateManualTransaction({
      onSuccess: () => {
        toast.success({
          title: t('toast.success.title'),
          description: t('toast.success.description'),
        });

        queryClient.invalidateQueries({
          queryKey: [useBillingServiceGetBillingTransactionsKey],
        });
        queryClient.invalidateQueries({
          queryKey: UseBillingServiceGetBillingBalanceKeyFn({ userId: userId as number }),
        });
      },
      onError: (error: Error) => {
        toast.apiError({
          error,
          t,
          tExists,
          baseTranslationKey: 'api',
        });
      },
    });

  const handleCreateTransaction = useCallback(() => {
    if (!userId) {
      return;
    }

    if (!configuration) {
      return;
    }

    const adjustedAmount = userCurrencyToDbCurrency(amount, configuration.minorUnit);

    createManualTransaction({ userId: userId, requestBody: { amount: adjustedAmount } });
  }, [userId, amount, createManualTransaction, configuration]);

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<HandCoinsIcon />} noMargin />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <NumberInput label={t('inputs.amount')} value={amount} onValueChange={(value) => setAmount(value)} />
      </CardContent>

      <CardFooter>
        <Button color="primary" onPress={handleCreateTransaction} isLoading={isCreatingManualTransaction}>
          {t('actions.createTransaction')}
        </Button>
      </CardFooter>
    </Card>
  );
}
