import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  Alert,
  AlertContent,
  AlertTitle,
  cn,
  Form,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Spinner,
} from '@heroui/react';
import { Button } from '../../../../components/button';
import { PageHeader } from '../../../../components/pageHeader';
import { SumUpIcon } from '../../../../components/icons/sumup.icon';
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
import { Select } from '../../../../components/select';
import { TransactionProcessingCard } from './transactionProcessingStatus';
import { useAuth } from '../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

interface Props {
  className?: string;
  title?: string;
  subtitle?: string;
  desiredAmount?: number;
  onProcessingComplete?: () => void;
}

export function BillingDashboardTopupCard(props: Props) {
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

  if (isLoadingSumUpConfiguration) {
    return (
      <div className={cn('w-full flex flex-col gap-6', className)}>
        <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </div>
    );
  }

  if (isSumUpConfigurationError || !sumUpConfiguration?.enabled) {
    return (
      <div className={cn('w-full flex flex-col gap-6', className)}>
        <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        <Alert status={isSumUpConfigurationError ? 'danger' : 'warning'}>
          <AlertContent>
            <AlertTitle>{t('unavailable.title')}</AlertTitle>
          </AlertContent>
          <p className="text-sm">{t('unavailable.description')}</p>
        </Alert>
      </div>
    );
  }

  if (topUpTransaction) {
    return (
      <TransactionProcessingCard
        transactionId={topUpTransaction?.id}
        onProcessingComplete={() => {
          setTopUpTransaction(null);
          onProcessingComplete?.();
        }}
      />
    );
  }

  return (
    <div className={cn('w-full flex flex-col gap-6', className)}>
      <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />

      <Form
        className="gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {(readers ?? []).length > 1 && (
          <Select
            items={readers?.map((reader) => ({ key: reader.id, label: reader.name })) ?? []}
            label={t('inputs.reader.label')}
            value={readerId}
            onChange={(key) => setReaderId(key as string)}
          />
        )}

        <NumberField
          aria-label={t('inputs.amount.label')}
          value={amount}
          onChange={(value) => setAmount(value)}
          minValue={1}
        >
          <NumberFieldGroup>
            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
            <NumberFieldInput />
            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          </NumberFieldGroup>
        </NumberField>
        <input type="submit" hidden />
      </Form>

      <Alert status="warning">
        <AlertContent>
          <AlertTitle>{t('topUpInstructions.title')}</AlertTitle>
        </AlertContent>
        <p className="max-w-[600px] text-sm whitespace-pre-wrap text-wrap">{t('topUpInstructions.description')}</p>
      </Alert>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onPress={onSubmit}
          isPending={isPendingTopUpWithSumUpReader}
          isDisabled={!readerId || amount === 0}
        >
          {t('actions.topUp', { amount: formatNumber(amount), currency: configuration?.currency })}
        </Button>
      </div>
    </div>
  );
}
