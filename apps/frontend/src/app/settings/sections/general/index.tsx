import { useState } from 'react';
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
  // Derived draft, not a seeded one: a key absent from `draft` means "untouched in this session",
  // and the displayed value falls back to the server's. The alternative — an effect that reassigns
  // the whole draft whenever the query object changes — overwrites edits the operator has not saved
  // yet as soon as a background refetch lands (ATT-868).
  const [draft, setDraft] = useState<Partial<Record<'url' | 'publicInternetUrl' | 'licenseKey', string>>>({});
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  // Same query/mutation contract as the old AppSettingsForm — only the presentation changed.
  // A license key is never returned by the API, so its baseline is always empty and any non-empty
  // draft is a change.
  const savedUrl = settings?.app.url ?? '';
  const savedPublicUrl = settings?.app.publicInternetUrl ?? '';

  const url = draft.url ?? savedUrl;
  const publicInternetUrl = draft.publicInternetUrl ?? savedPublicUrl;
  const licenseKey = draft.licenseKey ?? '';

  const { mutate: saveSettings, isPending: isSaving } = useSettingsServiceUpdateSystemSettings({
    onSuccess(data) {
      toast.success({ title: t('success.title'), description: t('success.description') });
      // Prime the cache from the response and release the pin in the same tick. Invalidating and
      // then clearing the draft would flash the pre-save value for a frame while the refetch is in
      // flight, and holding the pin past the commit would make the fields ignore the server for the
      // lifetime of the mount — a later change by another operator would then surface as a phantom
      // "unsaved changes" bar whose Save reverts them.
      queryClient.setQueryData(UseSettingsServiceGetSystemSettingsKeyFn(), data);
      setDraft({});
    },
    onError(error: Error) {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const isDirty = url !== savedUrl || publicInternetUrl !== savedPublicUrl || licenseKey.trim() !== '';

  const trimmedUrl = url.trim();
  const trimmedPublicUrl = publicInternetUrl.trim();

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
          url: trimmedUrl,
          // `null`, not `undefined`: the write is gated on the key being present and
          // `JSON.stringify` drops undefined, so emptying the field would be a no-op that still
          // reports success. `licenseKey` is never returned by the API, so empty legitimately
          // means "unchanged" there and stays undefined.
          publicInternetUrl: trimmedPublicUrl || null,
          licenseKey: licenseKey.trim() || undefined,
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
      {/* `validationBehavior="aria"` is load-bearing, not decoration. RAC's Form defaults to
          "native" and sets `noValidate` only when it is not — so with the default, the browser's
          own constraint check runs first on implicit submission (Enter) and swallows the `submit`
          event whenever `isRequired`/`type="url"` fail. handleSave would never run, so
          hasAttemptedSave would never flip, so the FieldError would never render, and react-aria
          suppresses the native bubble on top: pressing Enter on an empty URL would do nothing at
          all. In "aria" mode the constraints become advisory (aria-required) and submit always
          reaches the guard below, which is the only validator now. */}
      <Form
        validationBehavior="aria"
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
            value={url}
            isInvalid={hasAttemptedSave && !!urlError}
            onChange={(next) => setDraft((current) => ({ ...current, url: next }))}
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
            value={publicInternetUrl}
            isInvalid={hasAttemptedSave && !!publicUrlError}
            onChange={(next) => setDraft((current) => ({ ...current, publicInternetUrl: next }))}
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
              value={licenseKey}
              onChange={(next) => setDraft((current) => ({ ...current, licenseKey: next }))}
            />
            <CommunityLicenseButton
              isDisabled={isSaving}
              onAccept={(next) => setDraft((current) => ({ ...current, licenseKey: next }))}
            />
          </div>
        </SettingsRow>
        <input type="submit" hidden />
      </Form>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={() => setDraft({})}
      />
    </SettingsSection>
  );
}

export default GeneralSection;
