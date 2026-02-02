import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@attraccess/react-query-client';
import { Button, Card, CardBody, CardFooter, CardHeader, Chip, Form, Input, Spinner, Switch } from '@heroui/react';
import { CheckIcon, Settings2Icon, XIcon, MailIcon } from 'lucide-react';
import { getSystemSettings, updateSystemSettings, type UpdateSystemSettingsPayload } from '../../api/settings';
import { PageHeader } from '../../components/pageHeader';
import { PasswordInput } from '../../components/PasswordInput';
import { Select } from '../../components/select';
import { useToastMessage } from '../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export function SystemSettingsPage() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
  });

  const [frontendUrl, setFrontendUrl] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [publicInternetUrl, setPublicInternetUrl] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  const [smtpService, setSmtpService] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpPass, setSmtpPass] = useState('');

  useEffect(() => {
    if (!settings) {
      return;
    }
    setFrontendUrl(settings.app.frontendUrl ?? '');
    setBackendUrl(settings.app.backendUrl ?? '');
    setPublicInternetUrl(settings.app.publicInternetUrl ?? '');
    setLicenseKey('');

    setSmtpService(settings.smtp.service ?? '');
    setSmtpHost(settings.smtp.host ?? '');
    setSmtpPort(settings.smtp.port ? String(settings.smtp.port) : '');
    setSmtpSecure(settings.smtp.secure ?? false);
    setSmtpUser(settings.smtp.user ?? '');
    setSmtpFrom(settings.smtp.from ?? '');
    setSmtpPass('');
  }, [settings]);

  const onMutationSuccess = useCallback(() => {
    toast.success({
      title: t('success.title'),
      description: t('success.description'),
    });
    queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    setLicenseKey('');
    setSmtpPass('');
  }, [queryClient, t, toast]);

  const onMutationError = useCallback(
    (error: Error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
    [t, tExists, toast],
  );

  const { mutate: saveAppSettings, isPending: isSavingApp } = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const { mutate: saveSmtpSettings, isPending: isSavingSmtp } = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const appFormRef = useRef<HTMLFormElement>(null);
  const smtpFormRef = useRef<HTMLFormElement>(null);

  const onSubmitApp = useCallback(() => {
    if (!appFormRef.current?.checkValidity()) {
      return;
    }

    const payload: UpdateSystemSettingsPayload = {
      app: {
        frontendUrl: frontendUrl.trim(),
        backendUrl: backendUrl.trim(),
        publicInternetUrl: publicInternetUrl.trim() ? publicInternetUrl.trim() : null,
      },
    };

    const trimmedLicense = licenseKey.trim();
    if (trimmedLicense) {
      payload.app!.licenseKey = trimmedLicense;
    }

    saveAppSettings(payload);
  }, [backendUrl, frontendUrl, licenseKey, publicInternetUrl, saveAppSettings]);

  const onSubmitSmtp = useCallback(() => {
    if (!smtpFormRef.current?.checkValidity()) {
      return;
    }

    const parsedPort = smtpPort.trim() ? Number(smtpPort) : null;
    const portValue = parsedPort !== null && Number.isNaN(parsedPort) ? null : parsedPort;

    const payload: UpdateSystemSettingsPayload = {
      smtp: {
        service: smtpService ? (smtpService as 'SMTP' | 'Outlook365') : null,
        host: smtpHost.trim() ? smtpHost.trim() : null,
        port: portValue,
        secure: smtpSecure,
        user: smtpUser.trim() ? smtpUser.trim() : null,
        from: smtpFrom.trim() ? smtpFrom.trim() : null,
      },
    };

    const trimmedPass = smtpPass.trim();
    if (trimmedPass) {
      payload.smtp!.pass = trimmedPass;
    }

    saveSmtpSettings(payload);
  }, [smtpFrom, smtpHost, smtpPass, smtpPort, smtpSecure, smtpService, smtpUser, saveSmtpSettings]);

  const smtpServiceOptions = [
    { key: '', label: t('sections.smtp.service.none') },
    { key: 'SMTP', label: t('sections.smtp.service.smtp') },
    { key: 'Outlook365', label: t('sections.smtp.service.outlook') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />

      <Card>
        <CardHeader>
          <PageHeader
            title={t('sections.app.title')}
            subtitle={t('sections.app.subtitle')}
            icon={<Settings2Icon size={18} />}
            noMargin
            actions={
              <Chip color={settings?.app.licenseKeyConfigured ? 'success' : 'warning'} variant="flat">
                <div className="flex items-center gap-2">
                  {settings?.app.licenseKeyConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
                  {settings?.app.licenseKeyConfigured
                    ? t('sections.app.licenseStatus.configured')
                    : t('sections.app.licenseStatus.missing')}
                </div>
              </Chip>
            }
          />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-default-500">
              <Spinner size="sm" />
              {t('loading')}
            </div>
          ) : (
            <Form
              ref={appFormRef}
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitApp();
              }}
              className="flex flex-col gap-4"
            >
              <Input
                label={t('sections.app.inputs.frontendUrl.label')}
                description={t('sections.app.inputs.frontendUrl.description')}
                type="url"
                isRequired
                value={frontendUrl}
                onValueChange={setFrontendUrl}
              />
              <Input
                label={t('sections.app.inputs.backendUrl.label')}
                description={t('sections.app.inputs.backendUrl.description')}
                type="url"
                isRequired
                value={backendUrl}
                onValueChange={setBackendUrl}
              />
              <Input
                label={t('sections.app.inputs.publicInternetUrl.label')}
                description={t('sections.app.inputs.publicInternetUrl.description')}
                type="url"
                value={publicInternetUrl}
                onValueChange={setPublicInternetUrl}
              />
              <PasswordInput
                label={t('sections.app.inputs.licenseKey.label')}
                description={t('sections.app.inputs.licenseKey.description')}
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
                autoComplete="off"
              />
              <input type="submit" hidden />
            </Form>
          )}
        </CardBody>
        <CardFooter>
          <Button color="primary" onPress={onSubmitApp} isLoading={isSavingApp} isDisabled={isLoading}>
            {t('actions.save')}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <PageHeader
            title={t('sections.smtp.title')}
            subtitle={t('sections.smtp.subtitle')}
            icon={<MailIcon size={18} />}
            noMargin
            actions={
              <Chip color={settings?.smtp.passConfigured ? 'success' : 'warning'} variant="flat">
                <div className="flex items-center gap-2">
                  {settings?.smtp.passConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
                  {settings?.smtp.passConfigured
                    ? t('sections.smtp.passwordStatus.configured')
                    : t('sections.smtp.passwordStatus.missing')}
                </div>
              </Chip>
            }
          />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-default-500">
              <Spinner size="sm" />
              {t('loading')}
            </div>
          ) : (
            <Form
              ref={smtpFormRef}
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitSmtp();
              }}
              className="flex flex-col gap-4"
            >
              <Select
                label={t('sections.smtp.inputs.service.label')}
                selectedKey={smtpService}
                onSelectionChange={setSmtpService}
                items={smtpServiceOptions}
              />

              <Input
                label={t('sections.smtp.inputs.host.label')}
                description={t('sections.smtp.inputs.host.description')}
                value={smtpHost}
                onValueChange={setSmtpHost}
                isRequired={smtpService === 'SMTP'}
                isDisabled={smtpService !== 'SMTP'}
              />
              <Input
                label={t('sections.smtp.inputs.port.label')}
                description={t('sections.smtp.inputs.port.description')}
                type="number"
                value={smtpPort}
                onValueChange={setSmtpPort}
                isRequired={smtpService === 'SMTP'}
                isDisabled={smtpService !== 'SMTP'}
                min={1}
              />
              <Switch isSelected={smtpSecure} onValueChange={setSmtpSecure} isDisabled={smtpService !== 'SMTP'}>
                {t('sections.smtp.inputs.secure.label')}
              </Switch>
              <Input
                label={t('sections.smtp.inputs.user.label')}
                description={t('sections.smtp.inputs.user.description')}
                value={smtpUser}
                onValueChange={setSmtpUser}
              />
              <PasswordInput
                label={t('sections.smtp.inputs.pass.label')}
                description={t('sections.smtp.inputs.pass.description')}
                value={smtpPass}
                onChange={(event) => setSmtpPass(event.target.value)}
                autoComplete="off"
              />
              <Input
                label={t('sections.smtp.inputs.from.label')}
                description={t('sections.smtp.inputs.from.description')}
                value={smtpFrom}
                onValueChange={setSmtpFrom}
                isRequired={smtpService !== ''}
                isDisabled={smtpService === ''}
              />
              <input type="submit" hidden />
            </Form>
          )}
        </CardBody>
        <CardFooter>
          <Button color="primary" onPress={onSubmitSmtp} isLoading={isSavingSmtp} isDisabled={isLoading}>
            {t('actions.save')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default SystemSettingsPage;
