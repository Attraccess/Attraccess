import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  Currency,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingConfigurationKey,
  useBillingServiceSetBillingConfiguration,
} from '@attraccess/react-query-client';
import { Button, Card, CardProps, Form } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { EuroIcon } from 'lucide-react';
import { Select } from '../../../../../../components/select';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

export function CurrencyCard(props: Omit<CardProps, 'children'>) {
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

  const { data: configuration } = useBillingServiceGetBillingConfiguration();
  const { mutate: setConfiguration, isPending: isPendingSetConfiguration } = useBillingServiceSetBillingConfiguration({
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });

      queryClient.invalidateQueries({
        queryKey: [useBillingServiceGetBillingConfigurationKey],
      });
    },
  });

  const [currency, setCurrency] = useState<Currency>((configuration?.currency as Currency) || Currency.EUR);

  const configFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setCurrency(configuration?.currency || Currency.EUR);
  }, [configuration]);

  const onSubmitConfiguration = useCallback(() => {
    if (!configFormRef.current?.checkValidity()) {
      return;
    }

    setConfiguration({
      requestBody: {
        currency,
      },
    });
  }, [setConfiguration, currency]);

  return (
    <Card {...props}>
      <Card.Header>
        <PageHeader icon={<EuroIcon size={20} />} title={t('title')} subtitle={t('subtitle')} noMargin />
      </Card.Header>
      <Card.Content>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitConfiguration();
          }}
          ref={configFormRef}
          className="flex flex-col gap-4"
        >
          <Select
            items={Object.values(Currency).map((currency) => ({
              key: currency,
              label: currency,
            }))}
            label={t('inputs.currency.label')}
            value={currency}
            onChange={(key) => setCurrency(key as Currency)}
          />

          <input type="submit" hidden />
        </Form>

        <Card.Footer>
          <Button variant="primary" onPress={onSubmitConfiguration} isPending={isPendingSetConfiguration}>
            {t('actions.save')}
          </Button>
        </Card.Footer>
      </Card.Content>
    </Card>
  );
}
