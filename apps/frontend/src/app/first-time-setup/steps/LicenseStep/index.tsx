import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form } from '@heroui/react';
import { KeyRoundIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  useSettingsServiceApplyFirstTimeSetupSettings,
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn,
  UseSettingsServiceGetSystemSettingsKeyFn,
} from '@attraccess/react-query-client';
import { PageHeader } from '../../../../components/pageHeader';
import { PasswordInput } from '../../../../components/PasswordInput';
import { CommunityLicenseButton } from '../../../../components/CommunityLicenseButton';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export type LicenseStepProps = {
  onSuccess?: () => void;
};

export function LicenseStep({ onSuccess }: LicenseStepProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [licenseKey, setLicenseKey] = useState('');

  const mutateConfig = useMemo(
    () => ({
      onSuccess() {
        toast.success({
          title: t('success.title'),
          description: t('success.description'),
        });
        queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetSystemSettingsKeyFn() });
        queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetFirstTimeSetupStatusKeyFn() });
        setLicenseKey('');
        onSuccess?.();
      },
      onError(error: Error) {
        toast.apiError({
          error: error as ApiError,
          t,
          tExists,
          baseTranslationKey: 'api',
        });
      },
    }),
    [t, tExists, toast, queryClient, onSuccess],
  );

  const { mutate: saveSettings, isPending } = useSettingsServiceApplyFirstTimeSetupSettings(mutateConfig);

  const handleSubmit = useCallback(() => {
    const trimmed = licenseKey.trim();
    if (!trimmed) return;
    if (!formRef.current?.checkValidity()) return;
    saveSettings({ requestBody: { app: { licenseKey: trimmed } } });
  }, [licenseKey, saveSettings]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<KeyRoundIcon size={18} />}
        noMargin
      />
      <Alert color="primary" variant="flat" description={t('intro')} />
      <CommunityLicenseButton onAccept={setLicenseKey} isDisabled={isPending} />
      <Form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <PasswordInput
          label={t('inputs.licenseKey.label')}
          description={t('inputs.licenseKey.description')}
          value={licenseKey}
          onValueChange={setLicenseKey}
          autoComplete="off"
          isRequired
        />
        <input type="submit" hidden />
      </Form>
      <Button variant="primary"
        onPress={handleSubmit}
        isPending={isPending}
        isDisabled={!licenseKey.trim()}
      >
        {t('actions.save')}
      </Button>
    </div>
  );
}
