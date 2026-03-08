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
  useSettingsServiceTestSmtpSettings,
} from '@attraccess/react-query-client';
import { Button, Form, Input, Spinner, Switch } from '@heroui/react';
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

  const { mutate: testSmtp, isPending: isTesting } = useSettingsServiceTestSmtpSettings({
    onSuccess() {
      toast.success({
        title: t('test.success.title'),
        description: t('test.success.description'),
      });
    },
    onError(error: Error) {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const isSaving = endpoint === 'first-time-setup' ? isSavingFirstTimeSetup : isSavingNormal;

  const buildSmtpPayload = useCallback(() => {
    if (smtpService !== SmtpServiceType.SMTP && smtpService !== SmtpServiceType.OUTLOOK365) return null;
    return {
      service: smtpService,
      host: smtpHost,
      port: Number(smtpPort),
      secure: smtpSecure,
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    };
  }, [smtpService, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom]);

  const handleTest = useCallback(() => {
    if (!formRef.current?.checkValidity()) return;
    const smtp = buildSmtpPayload();
    if (!smtp) return;
    testSmtp({ requestBody: smtp });
  }, [buildSmtpPayload, testSmtp]);

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) return;
    const smtp = buildSmtpPayload();
    if (!smtp) return;

    const payload = { requestBody: { smtp } };

    if (endpoint === 'first-time-setup') {
      saveSettingsFirstTimeSetup(payload);
    } else {
      saveSettings(payload);
    }
  }, [endpoint, buildSmtpPayload, saveSettings, saveSettingsFirstTimeSetup]);

  const smtpServiceOptions = [
    { key: SmtpServiceType.SMTP, label: t('service.smtp') },
    { key: SmtpServiceType.OUTLOOK365, label: t('service.outlook') },
  ];

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
      <Input
        label={t('inputs.host.label')}
        description={t('inputs.host.description')}
        value={smtpHost}
        onValueChange={setSmtpHost}
        isRequired
        isDisabled={smtpService !== SmtpServiceType.SMTP}
      />
      <Input
        label={t('inputs.port.label')}
        description={t('inputs.port.description')}
        type="number"
        value={smtpPort}
        onValueChange={setSmtpPort}
        isRequired
        isDisabled={smtpService !== SmtpServiceType.SMTP}
        min={1}
      />
      <Switch
        isSelected={smtpSecure}
        onValueChange={setSmtpSecure}
        isDisabled={smtpService !== SmtpServiceType.SMTP}
      >
        {t('inputs.secure.label')}
      </Switch>
      <Input
        label={t('inputs.user.label')}
        description={t('inputs.user.description')}
        value={smtpUser}
        onValueChange={setSmtpUser}
        isRequired
      />
      <PasswordInput
        label={t('inputs.pass.label')}
        description={t('inputs.pass.description')}
        value={smtpPass}
        onValueChange={setSmtpPass}
        autoComplete="off"
      />
      <Input
        label={t('inputs.from.label')}
        description={t('inputs.from.description')}
        value={smtpFrom}
        onValueChange={setSmtpFrom}
        isRequired
      />
      <div className="flex gap-2">
        <Button
          color="primary"
          onPress={handleSubmit}
          isLoading={isSaving}
          isDisabled={showLoading || isTesting}
        >
          {variant === 'wizard' ? t('actions.next') : t('actions.save')}
        </Button>
        <Button
          variant="bordered"
          onPress={handleTest}
          isLoading={isTesting}
          isDisabled={showLoading || isSaving}
        >
          {t('actions.test')}
        </Button>
      </div>
      <input type="submit" hidden />
    </Form>
  );
}
