import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { Button, Card, CardBody, CardFooter, CardHeader, CardProps, Form, NumberInput } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { SumUpIcon } from '../../../../components/icons/sumup.icon';
import {
  useBillingServiceGetBillingTransactionsKey,
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpReaders,
  useBillingServiceTopUpWithSumUpReader,
} from '@attraccess/react-query-client';
import { useCallback, useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '../../../../components/select';

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

  const [amount, setAmount] = useState<number>(0);
  const [readerId, setReaderId] = useState<string | undefined>();

  const onSubmit = useCallback(() => {
    if (!readerId) {
      return;
    }

    topUpWithSumUpReader({
      requestBody: {
        tokenCount: amount,
        readerId,
      },
    });
  }, [amount, topUpWithSumUpReader, readerId]);

  if (!configuration?.enabled) {
    return null;
  }

  return (
    <Card {...props}>
      <CardHeader>
        <PageHeader title={t('title')} icon={<SumUpIcon />} />
      </CardHeader>

      <CardBody>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <Select
            items={readers?.map((reader) => ({ key: reader.id, label: reader.name })) ?? []}
            label={t('inputs.reader.label')}
            selectedKey={readerId ?? ''}
            onSelectionChange={(key) => setReaderId(key as string)}
          />

          <NumberInput
            label={t('inputs.amount.label')}
            description={t('inputs.amount.description')}
            value={amount}
            onValueChange={(value) => setAmount(value)}
          />
          <input type="submit" hidden />
        </Form>
      </CardBody>

      <CardFooter>
        <Button color="primary" onPress={onSubmit} isLoading={isPendingTopUpWithSumUpReader}>
          {t('actions.topUp')}
        </Button>
      </CardFooter>
    </Card>
  );
}
