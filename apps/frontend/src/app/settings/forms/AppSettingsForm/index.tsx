import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  useSettingsServiceApplyFirstTimeSetupSettings,
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn,
  useSettingsServiceGetSystemSettings,
  UseSettingsServiceGetSystemSettingsKeyFn,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { Button, Form, TextField, Label, Input, Description, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../../../components/PasswordInput';
import { CommunityLicenseButton } from '../../../../components/CommunityLicenseButton';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export type AppSettingsFormVariant = 'standalone' | 'wizard';

export type AppSettingsFormProps = {
  variant: AppSettingsFormVariant;
  endpoint: 'first-time-setup' | 'settings';
  onNext?: () => void;
};

export function AppSettingsForm({ variant, endpoint, onNext }: AppSettingsFormProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [url, setUrl] = useState(window.location.origin);
  const [publicInternetUrl, setPublicInternetUrl] = useState(window.location.origin);
  const [licenseKey, setLicenseKey] = useState('');

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings(undefined, { enabled: variant === 'standalone' });

  useEffect(() => {
    if (variant !== 'standalone' || !settings) return;
    setUrl(settings.app.url ?? '');
    setPublicInternetUrl(settings.app.publicInternetUrl ?? '');
    setLicenseKey('');
  }, [variant, settings]);

  const mutateConfig = useMemo(() => {
    return {
      onSuccess() {
        toast.success({
          title: t('success.title'),
          description: t('success.description'),
        });
        queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetSystemSettingsKeyFn() });
        if (endpoint === 'first-time-setup') {
          queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetFirstTimeSetupStatusKeyFn() });
        }
        setLicenseKey('');
        if (variant === 'wizard') onNext?.();
      },
      onError(error: Error) {
        toast.apiError({
          error: error as ApiError,
          t,
          tExists,
          baseTranslationKey: 'api',
        });
      },
    }
  }, [endpoint, variant, t, tExists, toast, queryClient, onNext]);

  const { mutate: saveSettings, isPending: isSavingNormal } = useSettingsServiceUpdateSystemSettings(mutateConfig);
  const { mutate: saveSettingsFirstTimeSetup, isPending: isSavingFirstTimeSetup } = useSettingsServiceApplyFirstTimeSetupSettings(mutateConfig);

  const isSaving = endpoint === 'first-time-setup' ? isSavingFirstTimeSetup : isSavingNormal;

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) return;

    const payload = {
      requestBody: {
        app: {
          url: url.trim(),
          publicInternetUrl: publicInternetUrl.trim() ? publicInternetUrl.trim() : undefined,
          licenseKey: licenseKey.trim() ? licenseKey.trim() : undefined,
        },
      },
    };

    if (endpoint === 'first-time-setup') {
      saveSettingsFirstTimeSetup(payload);
    } else {
      saveSettings(payload);
    }
  }, [url, publicInternetUrl, licenseKey, saveSettings, saveSettingsFirstTimeSetup, endpoint]);

  const showLoading = variant === 'standalone' && isLoading;

  if (showLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <TextField isRequired value={url} onChange={setUrl}>
        <Label>{t('inputs.url.label')}</Label>
        <Input type="url" />
        <Description>{t('inputs.url.description')}</Description>
      </TextField>
      <TextField value={publicInternetUrl} onChange={setPublicInternetUrl}>
        <Label>{t('inputs.publicInternetUrl.label')}</Label>
        <Input type="url" />
        <Description>{t('inputs.publicInternetUrl.description')}</Description>
      </TextField>
      {variant === 'standalone' && (
        <>
          <PasswordInput
            label={t('inputs.licenseKey.label')}
            description={t('inputs.licenseKey.description')}
            value={licenseKey}
            onValueChange={setLicenseKey}
            autoComplete="off"
          />
          <CommunityLicenseButton onAccept={setLicenseKey} isDisabled={isSaving} />
        </>
      )}
      <Button variant="primary"
        onPress={handleSubmit}
        isPending={isSaving}
        isDisabled={showLoading}
      >
        {variant === 'wizard' ? t('actions.next') : t('actions.save')}
      </Button>
      <input type="submit" hidden />
    </Form>
  );
}
