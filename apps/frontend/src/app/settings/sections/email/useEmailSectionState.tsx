import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  SmtpServiceType,
  useSettingsServiceGetSystemSettings,
  UseSettingsServiceGetSystemSettingsKeyFn,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';
import { Field } from './index.field';
import { getSavedSmtpFields } from './index.helpers';
import { validateSmtpFields } from './index.helpers';
export function useEmailSectionState() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings();
  // Derived draft, matching Monitoring and General: an untouched field falls back to the server, so
  // a background refetch can never overwrite an edit the operator has not saved (ATT-868).
  const [draft, setDraft] = useState<Partial<Record<Field, string | boolean>>>({});
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const {
    service: savedService,
    host: savedHost,
    port: savedPort,
    secure: savedSecure,
    user: savedUser,
    from: savedFrom,
  } = getSavedSmtpFields(settings);

  const service = (draft.service as SmtpServiceType | undefined) ?? savedService;
  const isOutlook = service === SmtpServiceType.OUTLOOK365;
  // Every field derives from draft-then-stored, including the ones Outlook locks. Pinning them to
  // the constants instead meant an existing Outlook instance whose stored host, port or `secure`
  // differed from them mounted permanently dirty: a save bar with no edit behind it, which Discard
  // could not clear (the pinned values never came from `draft`) and whose Save silently rewrote the
  // stored transport. Switching *to* Outlook writes the constants into the draft below, so the
  // change is one the operator made and can discard.
  const host = (draft.host as string | undefined) ?? savedHost;
  const port = (draft.port as string | undefined) ?? savedPort;
  const secure = (draft.secure as boolean | undefined) ?? savedSecure;
  const user = (draft.user as string | undefined) ?? savedUser;
  const from = (draft.from as string | undefined) ?? savedFrom;
  // A stored password is never returned, so an empty box means "keep the current one" and any
  // typing is a change.
  const pass = (draft.pass as string | undefined) ?? '';

  const { mutate: saveSettings, isPending: isSaving } = useSettingsServiceUpdateSystemSettings({
    onSuccess(data) {
      toast.success({ title: t('success.title'), description: t('success.description') });
      // Prime from the response and release the draft in the same tick — see GeneralSection.
      queryClient.setQueryData(UseSettingsServiceGetSystemSettingsKeyFn(), data);
      setDraft({});
    },
    onError(error: Error) {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const isDirty =
    service !== savedService ||
    host !== savedHost ||
    port !== savedPort ||
    secure !== savedSecure ||
    user !== savedUser ||
    from !== savedFrom ||
    pass !== '';

  const { hostError, portNumber, portError, fromError, hasError } = validateSmtpFields(host, port, from, t);

  const handleSave = () => {
    setHasAttemptedSave(true);
    if (hasError) return;

    saveSettings({
      requestBody: {
        smtp: {
          service,
          host: host.trim(),
          port: portNumber,
          secure,
          // `null`, not `undefined`: the service is `hasOwnProperty`-keyed, and `JSON.stringify`
          // drops undefined keys — so an emptied box would send nothing and the stored username
          // would survive a "saved" toast. `pass` is the opposite case: empty genuinely means
          // "keep the current one", which is why it stays undefined.
          user: user.trim() || null,
          pass: pass || undefined,
          from: from.trim(),
        },
      },
    });
  };
  return {
    t,
    settings,
    isLoading,
    setDraft,
    hasAttemptedSave,
    service,
    isOutlook,
    host,
    port,
    secure,
    user,
    from,
    pass,
    isSaving,
    isDirty,
    hostError,
    portError,
    fromError,
    handleSave,
  } as const;
}
