import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  SmtpServiceType,
  useSettingsServiceApplyFirstTimeSetupSettings,
  useSettingsServiceGetSystemSettings,
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn,
  useSettingsServiceUpdateSystemSettings,
  useSettingsServiceGetSystemSettingsKey,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';
import { SmtpSettingsFormProps } from './index.contracts';
export function useSmtpSettingsFormState({ variant, endpoint, onNext }: SmtpSettingsFormProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [smtpService, setSmtpService] = useState<SmtpServiceType>(SmtpServiceType.SMTP);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpPass, setSmtpPass] = useState('');

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings(undefined, {
    enabled: variant === 'standalone',
  });

  useEffect(() => {
    if (variant !== 'standalone' || !settings) return;
    const service = settings.smtp.service;
    const nextService: SmtpServiceType =
      service === SmtpServiceType.SMTP || service === SmtpServiceType.OUTLOOK365 ? service : SmtpServiceType.SMTP;
    setSmtpService(nextService);
    if (nextService === SmtpServiceType.OUTLOOK365) {
      setSmtpHost(settings.smtp.host ?? 'smtp.office365.com');
      setSmtpPort(settings.smtp.port != null ? String(settings.smtp.port) : '587');
    } else {
      setSmtpHost(settings.smtp.host ?? '');
      setSmtpPort(settings.smtp.port != null ? String(settings.smtp.port) : '');
    }
    setSmtpSecure(settings.smtp.secure ?? false);
    setSmtpUser(settings.smtp.user ?? '');
    setSmtpFrom(settings.smtp.from ?? '');
    setSmtpPass('');
  }, [variant, settings]);

  const mutateConfig = useMemo(() => {
    return {
      onSuccess() {
        toast.success({
          title: t('success.title'),
          description: t('success.description'),
        });
        queryClient.invalidateQueries({ queryKey: [useSettingsServiceGetSystemSettingsKey] });
        if (endpoint === 'first-time-setup') {
          queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetFirstTimeSetupStatusKeyFn() });
        }
        setSmtpPass('');
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
    };
  }, [endpoint, variant, t, tExists, toast, queryClient, onNext]);

  const { mutate: saveSettings, isPending: isSavingNormal } = useSettingsServiceUpdateSystemSettings(mutateConfig);
  const { mutate: saveSettingsFirstTimeSetup, isPending: isSavingFirstTimeSetup } =
    useSettingsServiceApplyFirstTimeSetupSettings(mutateConfig);

  const isSaving = endpoint === 'first-time-setup' ? isSavingFirstTimeSetup : isSavingNormal;

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) return;
    if (smtpService !== SmtpServiceType.SMTP && smtpService !== SmtpServiceType.OUTLOOK365) return;

    const payload = {
      requestBody: {
        smtp: {
          service: smtpService,
          host: smtpHost,
          port: Number(smtpPort),
          secure: smtpSecure,
          user: smtpUser || undefined,
          pass: smtpPass || undefined,
          from: smtpFrom,
        },
      },
    };

    if (endpoint === 'first-time-setup') {
      saveSettingsFirstTimeSetup(payload);
    } else {
      saveSettings(payload);
    }
  }, [
    endpoint,
    smtpService,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFrom,
    saveSettings,
    saveSettingsFirstTimeSetup,
  ]);

  const smtpServiceOptions = [
    { key: SmtpServiceType.SMTP, label: t('service.smtp') },
    { key: SmtpServiceType.OUTLOOK365, label: t('service.outlook') },
  ];

  const showLoading = variant === 'standalone' && isLoading;
  return {
    t,
    formRef,
    smtpService,
    setSmtpService,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    smtpSecure,
    setSmtpSecure,
    smtpUser,
    setSmtpUser,
    smtpFrom,
    setSmtpFrom,
    smtpPass,
    setSmtpPass,
    isSaving,
    handleSubmit,
    smtpServiceOptions,
    showLoading,
    variant,
  } as const;
}
