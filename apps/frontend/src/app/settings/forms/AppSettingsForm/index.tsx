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
import { Button, Form, Input, Select, SelectItem, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../../../components/PasswordInput';
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

type CookieSameSitePolicy = 'lax' | 'strict' | 'none';

const COOKIE_SAME_SITE_OPTIONS: CookieSameSitePolicy[] = ['lax', 'strict', 'none'];

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
  const [cookieSameSite, setCookieSameSite] = useState<CookieSameSitePolicy>('lax');
  const [licenseKey, setLicenseKey] = useState('');

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings(undefined, { enabled: variant === 'standalone' });

  useEffect(() => {
    if (variant !== 'standalone' || !settings) return;
    setUrl(settings.app.url ?? '');
    setPublicInternetUrl(settings.app.publicInternetUrl ?? '');
    setCookieSameSite((settings.app.cookieSameSite as CookieSameSitePolicy) ?? 'lax');
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
          cookieSameSite,
          licenseKey: licenseKey.trim() ? licenseKey.trim() : undefined,
        },
      },
    };

    if (endpoint === 'first-time-setup') {
      saveSettingsFirstTimeSetup(payload);
    } else {
      saveSettings(payload);
    }
  }, [url, publicInternetUrl, cookieSameSite, licenseKey, saveSettings, saveSettingsFirstTimeSetup, endpoint]);

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
      <Input
        label={t('inputs.url.label')}
        description={t('inputs.url.description')}
        type="url"
        isRequired
        value={url}
        onValueChange={setUrl}
      />
      <Input
        label={t('inputs.publicInternetUrl.label')}
        description={t('inputs.publicInternetUrl.description')}
        type="url"
        value={publicInternetUrl}
        onValueChange={setPublicInternetUrl}
      />
      <Select
        label={t('inputs.cookieSameSite.label')}
        description={t('inputs.cookieSameSite.description')}
        selectedKeys={[cookieSameSite]}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0] as CookieSameSitePolicy;
          if (value) setCookieSameSite(value);
        }}
      >
        {COOKIE_SAME_SITE_OPTIONS.map((option) => (
          <SelectItem key={option} textValue={t(`inputs.cookieSameSite.options.${option}.label`)}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t(`inputs.cookieSameSite.options.${option}.label`)}</span>
              <span className="text-xs text-default-500">{t(`inputs.cookieSameSite.options.${option}.description`)}</span>
            </div>
          </SelectItem>
        ))}
      </Select>
      <PasswordInput
        label={t('inputs.licenseKey.label')}
        description={t('inputs.licenseKey.description')}
        value={licenseKey}
        onValueChange={setLicenseKey}
        autoComplete="off"
        isRequired={endpoint === 'first-time-setup'}
      />
      <Button
        color="primary"
        onPress={handleSubmit}
        isLoading={isSaving}
        isDisabled={showLoading}
      >
        {variant === 'wizard' ? t('actions.next') : t('actions.save')}
      </Button>
      <input type="submit" hidden />
    </Form>
  );
}
