import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  BillingTransaction,
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransactionsKey,
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpReaders,
  useBillingServiceTopUpWithSumUpReader,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import type { Props } from './index';

export function useBillingDashboardTopupCardState(props: Props) {
  const { className, title, subtitle, desiredAmount, onProcessingComplete } = props;
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
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [topUpTransaction, setTopUpTransaction] = useState<BillingTransaction | null>(null);

  const { data: configuration } = useBillingServiceGetBillingConfiguration();
  const {
    data: sumUpConfiguration,
    isLoading: isLoadingSumUpConfiguration,
    isError: isSumUpConfigurationError,
  } = useBillingServiceGetSumUpConfiguration();
  const { data: readers } = useBillingServiceGetSumUpReaders();
  const { mutate: topUpWithSumUpReader, isPending: isPendingTopUpWithSumUpReader } =
    useBillingServiceTopUpWithSumUpReader({
      onSuccess: (topupTransaction) => {
        setTopUpTransaction(topupTransaction);
        queryClient.invalidateQueries({ queryKey: [useBillingServiceGetBillingTransactionsKey] });
      },
      onError: (error: Error) => {
        toast.apiError({
          error,
          t,
          tExists,
          baseTranslationKey: 'error.toast',
        });
      },
    });

  const DEFAULT_DESIRED_AMOUNT = 10;
  const [amount, setAmount] = useState<number>(desiredAmount ?? DEFAULT_DESIRED_AMOUNT);
  const [readerId, setReaderId] = useState<string>('');

  useEffect(() => {
    setReaderId(readers?.[0]?.id ?? '');
  }, [readers]);

  const { user: currentUser } = useAuth();
  const { data: balance } = useBillingServiceGetBillingBalance({ userId: currentUser?.id ?? 0 });

  useEffect(() => {
    if (!configuration) {
      return;
    }

    let actualDesiredAmount = desiredAmount ?? DEFAULT_DESIRED_AMOUNT;
    if (desiredAmount !== undefined) {
      if ((balance?.value ?? 0) < 0) {
        actualDesiredAmount += dbCurrencyToUserCurrency(Math.abs(balance?.value ?? 0), configuration.minorUnit);
      }
    }

    setAmount(Math.ceil(actualDesiredAmount));
  }, [balance, desiredAmount, configuration]);

  const onSubmit = useCallback(() => {
    if (!readerId) {
      return;
    }

    if (!configuration) {
      return;
    }

    topUpWithSumUpReader({
      requestBody: {
        amount: userCurrencyToDbCurrency(amount, configuration.minorUnit),
        readerId,
      },
    });
  }, [amount, topUpWithSumUpReader, readerId, configuration]);

  const formatNumber = useNumberFormatter();
  return {
    className,
    title,
    subtitle,
    onProcessingComplete,
    t,
    topUpTransaction,
    setTopUpTransaction,
    configuration,
    sumUpConfiguration,
    isLoadingSumUpConfiguration,
    isSumUpConfigurationError,
    readers,
    isPendingTopUpWithSumUpReader,
    amount,
    setAmount,
    readerId,
    setReaderId,
    onSubmit,
    formatNumber,
  } as const;
}
