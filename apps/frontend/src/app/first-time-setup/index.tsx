import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@attraccess/react-query-client';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Form, Input, Spinner, Switch, Alert } from '@heroui/react';
import { Settings2Icon, MailIcon } from 'lucide-react';
import {
  applyFirstTimeSetup,
  getFirstTimeSetupAvailable,
  type UpdateSystemSettingsPayload,
} from '../../api/settings';
import { PageHeader } from '../../components/pageHeader';
import { PasswordInput } from '../../components/PasswordInput';
import { Select } from '../../components/select';
import { useToastMessage } from '../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export function FirstTimeSetupPage() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const navigate = useNavigate();

  const { data: setupStatus, isLoading: isCheckingSetup } = useQuery({
    queryKey: ['first-time-setup'],
    queryFn: getFirstTimeSetupAvailable,
  });

  useEffect(() => {
    if (!isCheckingSetup && setupStatus && !setupStatus.value) {
      navigate('/', { replace: true });
    }
  }, [isCheckingSetup, navigate, setupStatus]);

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

  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: saveSetup, isPending: isSaving } = useMutation({
    mutationFn: applyFirstTimeSetup,
    onSuccess: () => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      navigate('/', { replace: true });
    },
    onError: (error: Error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) {
      return;
    }

    const parsedPort = smtpPort.trim() ? Number(smtpPort) : null;
    const portValue = parsedPort !== null && Number.isNaN(parsedPort) ? null : parsedPort;

    const payload: UpdateSystemSettingsPayload = {
      app: {
        frontendUrl: frontendUrl.trim(),
        backendUrl: backendUrl.trim(),
        publicInternetUrl: publicInternetUrl.trim() ? publicInternetUrl.trim() : null,
      },
      smtp: {
        service: smtpService ? (smtpService as 'SMTP' | 'Outlook365') : null,
        host: smtpHost.trim() ? smtpHost.trim() : null,
        port: portValue,
        secure: smtpSecure,
        user: smtpUser.trim() ? smtpUser.trim() : null,
        from: smtpFrom.trim() ? smtpFrom.trim() : null,
      },
    };

    const trimmedLicense = licenseKey.trim();
    if (trimmedLicense) {
      payload.app!.licenseKey = trimmedLicense;
    }

    const trimmedPass = smtpPass.trim();
    if (trimmedPass) {
      payload.smtp!.pass = trimmedPass;
    }

    saveSetup(payload);
  }, [
    backendUrl,
    frontendUrl,
    licenseKey,
    publicInternetUrl,
    saveSetup,
    smtpFrom,
    smtpHost,
    smtpPass,
    smtpPort,
    smtpSecure,
    smtpService,
    smtpUser,
  ]);

  const smtpServiceOptions = [
    { key: '', label: t('sections.smtp.service.none') },
    { key: 'SMTP', label: t('sections.smtp.service.smtp') },
    { key: 'Outlook365', label: t('sections.smtp.service.outlook') },
  ];

  if (isCheckingSetup) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />

      <Alert color="primary" variant="flat">
        {t('note')}
      </Alert>

      <Form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <PageHeader
              title={t('sections.app.title')}
              subtitle={t('sections.app.subtitle')}
              icon={<Settings2Icon size={18} />}
              noMargin
            />
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <PageHeader
              title={t('sections.smtp.title')}
              subtitle={t('sections.smtp.subtitle')}
              icon={<MailIcon size={18} />}
              noMargin
            />
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
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
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button color="primary" onPress={onSubmit} isLoading={isSaving}>
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}

export default FirstTimeSetupPage;
