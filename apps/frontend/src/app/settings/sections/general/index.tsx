import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Form, Input, Spinner, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useSettingsServiceGetSystemSettings,
  UseSettingsServiceGetSystemSettingsKeyFn,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { PasswordInput } from '../../../../components/PasswordInput';
import { CommunityLicenseButton } from '../../../../components/CommunityLicenseButton';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

/** A never-persisted license key reads as "unchanged", so the baseline for it is always empty. */
const emptyDraft = { url: '', publicInternetUrl: '', licenseKey: '' };

export function GeneralSection() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings();
  const [draft, setDraft] = useState(emptyDraft);
  const formRef = useRef<HTMLFormElement>(null);

  // Same query/mutation contract as the old AppSettingsForm — only the presentation changed.
  const baseline = useMemo(
    () => ({
      url: settings?.app.url ?? '',
      publicInternetUrl: settings?.app.publicInternetUrl ?? '',
      licenseKey: '',
    }),
    [settings],
  );

  useEffect(() => setDraft(baseline), [baseline]);

  const { mutate: saveSettings, isPending: isSaving } = useSettingsServiceUpdateSystemSettings({
    onSuccess() {
      toast.success({ title: t('success.title'), description: t('success.description') });
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetSystemSettingsKeyFn() });
      setDraft((current) => ({ ...current, licenseKey: '' }));
    },
    onError(error: Error) {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const isDirty =
    draft.url !== baseline.url ||
    draft.publicInternetUrl !== baseline.publicInternetUrl ||
    draft.licenseKey.trim() !== '';

  const handleSave = () => {
    // `isRequired` and `type="url"` are native constraints that only fire on form submission, so
    // without this gate an empty or malformed URL reaches the API and comes back a generic 400
    // toast. `reportValidity` also paints the message on the offending field, which the old
    // `checkValidity` gate in AppSettingsForm did not.
    if (!formRef.current?.reportValidity()) return;

    saveSettings({
      requestBody: {
        app: {
          url: draft.url.trim(),
          publicInternetUrl: draft.publicInternetUrl.trim() || undefined,
          licenseKey: draft.licenseKey.trim() || undefined,
        },
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {/* A real <form> so the fields' native constraints exist to be validated; submitting it (the
          Enter key) routes to the same guarded save the save bar uses. */}
      <Form
        ref={formRef}
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <SettingsRow stacked label={t('inputs.url.label')} hint={t('inputs.url.description')}>
          <TextField
            isRequired
            className="w-full"
            aria-label={t('inputs.url.label')}
            value={draft.url}
            onChange={(url) => setDraft((current) => ({ ...current, url }))}
          >
            <Input type="url" />
          </TextField>
        </SettingsRow>

        <SettingsRow
          stacked
          label={t('inputs.publicInternetUrl.label')}
          hint={t('inputs.publicInternetUrl.description')}
        >
          <TextField
            className="w-full"
            aria-label={t('inputs.publicInternetUrl.label')}
            value={draft.publicInternetUrl}
            onChange={(publicInternetUrl) => setDraft((current) => ({ ...current, publicInternetUrl }))}
          >
            <Input type="url" />
          </TextField>
        </SettingsRow>

        <SettingsRow stacked label={t('inputs.licenseKey.label')} hint={t('inputs.licenseKey.description')}>
          <div className="flex w-full flex-col gap-2">
            <PasswordInput
              aria-label={t('inputs.licenseKey.label')}
              autoComplete="off"
              value={draft.licenseKey}
              onChange={(licenseKey) => setDraft((current) => ({ ...current, licenseKey }))}
            />
            <CommunityLicenseButton
              isDisabled={isSaving}
              onAccept={(licenseKey) => setDraft((current) => ({ ...current, licenseKey }))}
            />
          </div>
        </SettingsRow>
        <input type="submit" hidden />
      </Form>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={() => setDraft(baseline)}
      />
    </SettingsSection>
  );
}

export default GeneralSection;
