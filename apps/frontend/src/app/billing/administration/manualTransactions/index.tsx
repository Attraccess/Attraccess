import { NumberField, NumberFieldDecrementButton, NumberFieldGroup, NumberFieldIncrementButton, NumberFieldInput } from '@heroui/react';
import { Button } from '../../../../components/button';
import { PageHeader } from '../../../../components/pageHeader';
import { HandCoinsIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ComponentPropsWithoutRef, useCallback, useState } from 'react';
import { twMerge } from 'tailwind-merge';
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

export function ManualTransactionsCard(props: Props & Omit<ComponentPropsWithoutRef<'section'>, 'children'>) {
  const { userId, className, ...sectionProps } = props;
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
    <section {...sectionProps} className={twMerge('w-full flex flex-col gap-4', className)}>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<HandCoinsIcon />} noMargin />

      <NumberField aria-label={t('inputs.amount')} value={amount} onChange={(value) => setAmount(value)}>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>

      <div className="flex justify-end">
        <Button variant="primary" onPress={handleCreateTransaction} isPending={isCreatingManualTransaction}>
          {t('actions.createTransaction')}
        </Button>
      </div>
    </section>
  );
}
