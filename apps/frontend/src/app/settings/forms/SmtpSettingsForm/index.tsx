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
import { Button, Form, TextField, Label, Input, Description, Spinner, Switch } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../../../components/PasswordInput';
import { Select } from '../../../../components/select';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export type SmtpSettingsFormVariant = 'standalone' | 'wizard';

export type SmtpSettingsFormProps = {
  variant: SmtpSettingsFormVariant;
  onNext?: () => void;
  endpoint: 'first-time-setup' | 'settings';
};

export function SmtpSettingsForm({ variant, endpoint, onNext }: SmtpSettingsFormProps) {
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

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings(undefined, { enabled: variant === 'standalone' });

  useEffect(() => {
    if (variant !== 'standalone' || !settings) return;
    const service = settings.smtp.service;
    const nextService: SmtpServiceType =
      service === SmtpServiceType.SMTP || service === SmtpServiceType.OUTLOOK365
        ? service
        : SmtpServiceType.SMTP;
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
    }
  }, [endpoint, variant, t, tExists, toast, queryClient, onNext]);

  const { mutate: saveSettings, isPending: isSavingNormal } = useSettingsServiceUpdateSystemSettings(mutateConfig);
  const { mutate: saveSettingsFirstTimeSetup, isPending: isSavingFirstTimeSetup } = useSettingsServiceApplyFirstTimeSetupSettings(mutateConfig);

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
    }

    if (endpoint === 'first-time-setup') {
      saveSettingsFirstTimeSetup(payload);
    } else {
      saveSettings(payload);
    }
  }, [endpoint, smtpService, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, saveSettings, saveSettingsFirstTimeSetup]);

  const smtpServiceOptions = [
    { key: SmtpServiceType.SMTP, label: t('service.smtp') },
    { key: SmtpServiceType.OUTLOOK365, label: t('service.outlook') },
  ];

  const showLoading = variant === 'standalone' && isLoading;

  if (showLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner />
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
      <Select
        label={t('inputs.service.label')}
        selectedKey={smtpService}
        onSelectionChange={(key) => {
          const next = key as SmtpServiceType;
          setSmtpService(next);
          if (next === SmtpServiceType.OUTLOOK365) {
            setSmtpHost('smtp.office365.com');
            setSmtpPort('587');
          }
        }}
        items={smtpServiceOptions}
        isRequired
      />
      <TextField
        isRequired
        isDisabled={smtpService !== SmtpServiceType.SMTP}
        value={smtpHost}
        onChange={setSmtpHost}
      >
        <Label>{t('inputs.host.label')}</Label>
        <Input />
        <Description>{t('inputs.host.description')}</Description>
      </TextField>
      <TextField
        isRequired
        isDisabled={smtpService !== SmtpServiceType.SMTP}
        value={smtpPort}
        onChange={setSmtpPort}
      >
        <Label>{t('inputs.port.label')}</Label>
        <Input type="number" min={1} />
        <Description>{t('inputs.port.description')}</Description>
      </TextField>
      <Switch
        isSelected={smtpSecure}
        onChange={setSmtpSecure}
        isDisabled={smtpService !== SmtpServiceType.SMTP}
      >
        {t('inputs.secure.label')}
      </Switch>
      <TextField value={smtpUser} onChange={setSmtpUser}>
        <Label>{t('inputs.user.label')}</Label>
        <Input />
        <Description>{t('inputs.user.description')}</Description>
      </TextField>
      <PasswordInput
        label={t('inputs.pass.label')}
        description={t('inputs.pass.description')}
        value={smtpPass}
        onChange={setSmtpPass}
        autoComplete="off"
      />
      <TextField isRequired value={smtpFrom} onChange={setSmtpFrom}>
        <Label>{t('inputs.from.label')}</Label>
        <Input />
        <Description>{t('inputs.from.description')}</Description>
      </TextField>
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
