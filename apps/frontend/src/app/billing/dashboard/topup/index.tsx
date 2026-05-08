import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { NumberInput } from "../../../../utils/heroui-compat";
import en from './en.json';
import de from './de.json';
import { Alert, Button, Card, CardContent, CardFooter, CardHeader, CardProps, Spinner, cn, Form } from "@heroui/react";
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

type Props = Omit<CardProps, 'children'> & {
  title?: string;
  subtitle?: string;
  desiredAmount?: number;
  onProcessingComplete?: () => void;
};

export function BillingDashboardTopupCard(props: Props) {
  const { title, subtitle, desiredAmount, onProcessingComplete, ...cardProps } = props;
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
      <Card {...cardProps} className={cn('max-w-full', cardProps.className)}>
        <CardHeader>
          <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Spinner label={t('loading')} />
        </CardContent>
      </Card>
    );
  }

  if (isSumUpConfigurationError || !sumUpConfiguration?.enabled) {
    return (
      <Card {...cardProps} className={cn('max-w-full', cardProps.className)}>
        <CardHeader>
          <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        </CardHeader>
        <CardContent>
          <Alert
            color={isSumUpConfigurationError ? 'danger' : 'warning'}
            variant="flat"
            title={t('unavailable.title')}
          >
            <p className="text-sm">{t('unavailable.description')}</p>
          </Alert>
        </CardContent>
      </Card>
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
    <Card {...cardProps} className={cn('max-w-full', props.className)}>
      <CardHeader>
        <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
      </CardHeader>

      <CardContent>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {(readers ?? []).length > 1 && (
            <Select
              items={readers?.map((reader) => ({ key: reader.id, label: reader.name })) ?? []}
              label={t('inputs.reader.label')}
              selectedKey={readerId}
              onSelectionChange={(key) => setReaderId(key as string)}
            />
          )}

          <NumberInput
            label={t('inputs.amount.label')}
            description={t('inputs.amount.description')}
            value={amount}
            onValueChange={(value) => setAmount(value)}
            minValue={1}
          />
          <input type="submit" hidden />
        </Form>

        <div>
          <Alert color="warning" variant="flat" title={t('topUpInstructions.title')}>
            <p className="max-w-[600px] text-sm whitespace-pre-wrap text-wrap">{t('topUpInstructions.description')}</p>
          </Alert>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          color="primary"
          onPress={onSubmit}
          isLoading={isPendingTopUpWithSumUpReader}
          isDisabled={!readerId || amount === 0}
        >
          {t('actions.topUp', { amount: formatNumber(amount), currency: configuration?.currency })}
        </Button>
      </CardFooter>
    </Card>
  );
}
