import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpConfigurationKey,
  useBillingServiceGetSumUpReadersKey,
  useBillingServiceSetSumUpApiKey,
} from '@attraccess/react-query-client';
import { Button, Card, CardBody, CardHeader, Form, Chip, Spinner, Link, CardFooter, CardProps } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { PasswordInput } from '../../../../../../components/PasswordInput';
import { useCallback, useRef, useState } from 'react';
import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, WebhookIcon, XIcon } from 'lucide-react';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

export function ApiKeyCard(props: Omit<CardProps, 'children'>) {
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

  const { data: configuration, isLoading: isLoadingConfiguration } = useBillingServiceGetSumUpConfiguration();

  const { mutate: setSumUpApiKey, isPending: isPendingSetSumUpApiKey } = useBillingServiceSetSumUpApiKey({
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
        queryKey: [useBillingServiceGetSumUpConfigurationKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useBillingServiceGetSumUpReadersKey],
      });
    },
  });

  const [apiKey, setApiKey] = useState('');
  const apiKeyFormRef = useRef<HTMLFormElement>(null);

  const sumUpApiKeyUrl = 'https://developer.sumup.com/api-keys';

  const onSubmitApiKey = useCallback(() => {
    if (!apiKeyFormRef.current?.checkValidity()) {
      return;
    }

    setSumUpApiKey({
      requestBody: {
        apiKey,
      },
    });
  }, [setSumUpApiKey, apiKey]);

  return (
    <Card {...props}>
      <CardHeader>
        <PageHeader
          icon={<WebhookIcon size={20} />}
          title={t('title')}
          subtitle={t('subtitle')}
          noMargin
          actions={
            <Chip
              color={isLoadingConfiguration ? 'default' : configuration?.enabled ? 'success' : 'warning'}
              variant="flat"
            >
              <div className="flex items-center gap-2">
                {isLoadingConfiguration ? (
                  <Spinner size="sm" />
                ) : configuration?.enabled ? (
                  <CheckIcon size={16} />
                ) : (
                  <XIcon size={16} />
                )}
                {isLoadingConfiguration
                  ? t('status.loading.title')
                  : configuration?.enabled
                    ? t('status.enabled.title')
                    : t('status.disabled.title')}
              </div>
            </Chip>
          }
        />
      </CardHeader>

      <CardBody className="flex flex-col gap-2">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitApiKey();
          }}
          ref={apiKeyFormRef}
        >
          <PasswordInput
            label={t('inputs.apiKey.label')}
            description={t('inputs.apiKey.description')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            isRequired
          />

          <small>
            <Link isExternal href={sumUpApiKeyUrl} target="_blank" rel="noopener noreferrer">
              {sumUpApiKeyUrl}
            </Link>
          </small>

          <input type="submit" hidden />
        </Form>
      </CardBody>
      <CardFooter>
        <Button color="primary" onPress={onSubmitApiKey} isLoading={isPendingSetSumUpApiKey}>
          {t('actions.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
