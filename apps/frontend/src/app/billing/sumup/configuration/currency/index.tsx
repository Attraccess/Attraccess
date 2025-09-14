import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  currency as SumUpCurrency,
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpConfigurationKey,
  useBillingServiceSetSumUpConfiguration,
} from '@attraccess/react-query-client';
import { Button, Card, CardBody, CardHeader, Form, CardProps, CardFooter } from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { EuroIcon } from 'lucide-react';
import { Select } from '../../../../../components/select';

export function CurrencyCard(props: Omit<CardProps, 'children'>) {
  const { t, tExists } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: configuration } = useBillingServiceGetSumUpConfiguration();
  const { mutate: setSumUpConfiguration, isPending: isPendingSetSumUpConfiguration } =
    useBillingServiceSetSumUpConfiguration({
      onError: (error: Error) => {
        toast.apiError({
          error,
          t,
          tExists,
          baseTranslationKey: 'error.toast',
        });
      },
      onSuccess: () => {
        toast.success({
          title: t('success.toast.title'),
          description: t('success.toast.description'),
        });

        queryClient.invalidateQueries({
          queryKey: [useBillingServiceGetSumUpConfigurationKey],
        });
      },
    });

  const [currency, setCurrency] = useState<SumUpCurrency>(
    (configuration?.currency as SumUpCurrency) || SumUpCurrency.EUR,
  );

  const configFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setCurrency((configuration?.currency as SumUpCurrency) || SumUpCurrency.EUR);
  }, [configuration]);

  const onSubmitConfiguration = useCallback(() => {
    if (!configFormRef.current?.checkValidity()) {
      return;
    }

    setSumUpConfiguration({
      requestBody: {
        currency,
      },
    });
  }, [setSumUpConfiguration, currency]);

  return (
    <Card {...props}>
      <CardHeader>
        <PageHeader icon={<EuroIcon size={20} />} title={t('title')} subtitle={t('subtitle')} noMargin />
      </CardHeader>
      <CardBody>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitConfiguration();
          }}
          ref={configFormRef}
          className="flex flex-col gap-4"
        >
          <Select
            items={Object.values(SumUpCurrency).map((currency) => ({ key: currency, label: currency }))}
            label={t('inputs.currency.label')}
            selectedKey={currency}
            onSelectionChange={(key) => setCurrency(key as SumUpCurrency)}
          />

          <input type="submit" hidden />
        </Form>

        <CardFooter>
          <Button color="primary" onPress={onSubmitConfiguration} isLoading={isPendingSetSumUpConfiguration}>
            {t('actions.save')}
          </Button>
        </CardFooter>
      </CardBody>
    </Card>
  );
}
