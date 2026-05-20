import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  Currency,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingConfigurationKey,
  useBillingServiceSetBillingConfiguration,
} from '@attraccess/react-query-client';
import { Button, Form } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { ComponentPropsWithoutRef, useCallback, useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { EuroIcon } from 'lucide-react';
import { Select } from '../../../../../../components/select';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

export function CurrencyCard(props: Omit<ComponentPropsWithoutRef<'section'>, 'children'>) {
  const { className, ...sectionProps } = props;
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
    <section
      {...sectionProps}
      className={twMerge(
        'w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0',
        className
      )}
    >
      <PageHeader icon={<EuroIcon size={20} />} title={t('title')} subtitle={t('subtitle')} noMargin />

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitConfiguration();
        }}
        ref={configFormRef}
        className="flex flex-col gap-4 w-full"
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

      <div className="flex justify-end">
        <Button variant="primary" onPress={onSubmitConfiguration} isPending={isPendingSetConfiguration}>
          {t('actions.save')}
        </Button>
      </div>
    </section>
  );
}
