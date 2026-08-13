import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FieldError, Form, Input, Spinner, TextField } from '@heroui/react';
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

/** Mirrors the API's `@IsUrl()`: a full absolute URL, scheme included. */
const isAbsoluteUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export function GeneralSection() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings();
  const [draft, setDraft] = useState(emptyDraft);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

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

  const trimmedUrl = draft.url.trim();
  const trimmedPublicUrl = draft.publicInternetUrl.trim();

  // Validated here rather than left to `isRequired` + `type="url"`. Those are native constraints,
  // and react-aria cancels the `invalid` event to suppress the browser's bubble (`useFormValidation`
  // calls `e.preventDefault()` and blanks `title`), so nothing would be shown unless a `<FieldError>`
  // has text to render. Native messages also follow the *browser* locale, which would hand a German
  // string to an operator running the UI in English.
  const urlError = !trimmedUrl
    ? t('inputs.url.errors.required')
    : !isAbsoluteUrl(trimmedUrl)
      ? t('inputs.url.errors.invalid')
      : null;
  const publicUrlError =
    trimmedPublicUrl && !isAbsoluteUrl(trimmedPublicUrl) ? t('inputs.publicInternetUrl.errors.invalid') : null;

  const handleSave = () => {
    // Errors stay hidden until the first save attempt — flagging a half-typed URL red on every
    // keystroke is noise, not help.
    setHasAttemptedSave(true);
    if (urlError || publicUrlError) return;

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
            isInvalid={hasAttemptedSave && !!urlError}
            onChange={(url) => setDraft((current) => ({ ...current, url }))}
          >
            <Input type="url" />
            <FieldError>{urlError}</FieldError>
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
            isInvalid={hasAttemptedSave && !!publicUrlError}
            onChange={(publicInternetUrl) => setDraft((current) => ({ ...current, publicInternetUrl }))}
          >
            <Input type="url" />
            <FieldError>{publicUrlError}</FieldError>
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
