import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  currency as SumUpCurrency,
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpConfigurationKey,
  useBillingServiceSetSumUpConfiguration,
} from '@attraccess/react-query-client';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Form,
  NumberInput,
  Alert,
  Switch,
  CardProps,
  CardFooter,
} from '@heroui/react';
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
  const [currencyToCreditsRate, setCurrencyToCreditsRate] = useState(configuration?.currencyToCreditsRate ?? 100);
  const [adjustExistingBalances, setAdjustExistingBalances] = useState(false);
  const configFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setCurrency((configuration?.currency as SumUpCurrency) || SumUpCurrency.EUR);
    setCurrencyToCreditsRate(configuration?.currencyToCreditsRate ?? 100);
  }, [configuration]);

  const onSubmitConfiguration = useCallback(() => {
    if (!configFormRef.current?.checkValidity()) {
      return;
    }

    setSumUpConfiguration({
      requestBody: {
        currency,
        currencyToCreditsRate,
        adjustExistingBalances,
      },
    });
  }, [setSumUpConfiguration, currency, currencyToCreditsRate, adjustExistingBalances]);

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

          <NumberInput
            label={t('inputs.currencyToCreditsRate.label')}
            description={t('inputs.currencyToCreditsRate.description')}
            value={currencyToCreditsRate}
            onValueChange={setCurrencyToCreditsRate}
            isRequired
            minValue={0}
            defaultValue={100}
          />

          <Alert
            color="secondary"
            variant="faded"
            title={t('inputs.exampleExchange', { currency, credits: currencyToCreditsRate })}
          />

          <Switch isSelected={adjustExistingBalances} onValueChange={(value) => setAdjustExistingBalances(value)}>
            {t('inputs.adjustExistingBalances.label')}
          </Switch>

          <Alert
            color="secondary"
            variant="faded"
            title={t('inputs.exampleAdjustedBalances', {
              oldBalance: 1000,
              newBalance: !adjustExistingBalances
                ? 1000
                : (1000 / (configuration?.currencyToCreditsRate ?? 100)) * currencyToCreditsRate,
            })}
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
