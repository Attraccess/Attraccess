import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, CardProps, cn, Form, NumberInput } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { SumUpIcon } from '../../../../components/icons/sumup.icon';
import {
  useBillingServiceGetBillingTransactionsKey,
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpReaders,
  useBillingServiceTopUpWithSumUpReader,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '../../../../components/select';
import { config } from 'process';

export function BillingDashboardTopupCard(props: Omit<CardProps, 'children'>) {
  const { t, tExists } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: configuration } = useBillingServiceGetSumUpConfiguration();
  const { data: readers } = useBillingServiceGetSumUpReaders();
  const { mutate: topUpWithSumUpReader, isPending: isPendingTopUpWithSumUpReader } =
    useBillingServiceTopUpWithSumUpReader({
      onSuccess: () => {
        toast.success({
          title: t('success.toast.title'),
          description: t('success.toast.description'),
        });
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

  const [amount, setAmount] = useState<number>(1);
  const [readerId, setReaderId] = useState<string>('');

  useEffect(() => {
    setReaderId(readers?.[0]?.id ?? '');
  }, [readers]);

  const onSubmit = useCallback(() => {
    if (!readerId) {
      return;
    }

    topUpWithSumUpReader({
      requestBody: {
        amount,
        readerId,
      },
    });
  }, [amount, topUpWithSumUpReader, readerId]);

  if (!configuration?.enabled) {
    return null;
  }

  return (
    <Card {...props} className={cn('max-w-full', props.className)}>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<SumUpIcon />} noMargin />
      </CardHeader>

      <CardBody>
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
      </CardBody>

      <CardFooter>
        <Button
          color="primary"
          onPress={onSubmit}
          isLoading={isPendingTopUpWithSumUpReader}
          isDisabled={!readerId || amount === 0}
        >
          {t('actions.topUp', { amount: amount, currency: configuration?.currency })}
        </Button>
      </CardFooter>
    </Card>
  );
}
