import { Button, PasswordInput, StatusAlert, StatusDialog, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { useRef, useState, type FormEvent } from 'react';
import type { ConnectionSettings, SettingsInput } from './api';
import { useMatterTranslations } from './i18n';
import { validateCa, validateCredential, validateUrl } from './settingsValidation';

type Props = Readonly<{
  /** The settings as the server has them now. They are polled: a change made elsewhere arrives here as a new value. */
  settings: ConnectionSettings;
  /** Resolves with the settings as stored, which the form then shows. */
  onSave: (input: SettingsInput) => Promise<ConnectionSettings>;
  onRemove: () => Promise<void>;
}>;

type Notice = { kind: 'saved' } | { kind: 'error'; title: string; message: string } | { kind: 'remove' } | null;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The URL as the backend stores it (origin and path without trailing slashes), so a respelling is no change. */
function normalizedUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value.trim();
  }
}

/**
 * The token is write-only: once saved, the form only shows that one is configured and offers to replace it. The
 * backend never sends it back. Changing the URL or the CA certificate needs the token again, so a stored token never
 * goes to a new endpoint; the backend refuses such a save without it.
 *
 * The form is a draft of the settings it was loaded from (`base`). When another administrator saves meanwhile, the
 * new settings arrive through `settings`: an untouched form adopts them, a form with edits keeps them, says so and
 * blocks Save until the administrator reloads, so nothing is overwritten silently. URL, token and CA certificate are
 * checked while typing. Clearing the CA certificate can be undone until saved. After a dialog closes, the focus returns
 * to the control that started the action.
 */
export function SettingsForm({ settings, onSave, onRemove }: Props) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({});
  const [base, setBase] = useState(settings);
  const [url, setUrl] = useState(settings.url ?? '');
  const [replacing, setReplacing] = useState(!settings.credentialConfigured);
  const [credential, setCredential] = useState('');
  const [ca, setCa] = useState(settings.caCertificate ?? '');
  const [caCleared, setCaCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);

  const load = (next: ConnectionSettings) => {
    setBase(next);
    setUrl(next.url ?? '');
    setCa(next.caCertificate ?? '');
    setCaCleared(false);
    setCredential('');
    setReplacing(!next.credentialConfigured);
  };

  const caChanged = caCleared || ca.trim() !== (base.caCertificate ?? '').trim();
  const urlChanged = url.trim() !== (base.url ?? '');
  const dirty = urlChanged || caChanged || credential !== '' || (replacing && base.credentialConfigured);
  const changedElsewhere = settings.updatedAt !== base.updatedAt || settings.url !== base.url;
  // An untouched form follows the server; adopted during render, so there is no frame with stale values.
  if (changedElsewhere && !dirty && !busy) load(settings);

  const endpointChanged =
    base.credentialConfigured && (caChanged || (base.url !== null && normalizedUrl(url) !== normalizedUrl(base.url)));
  const needsCredential = replacing || endpointChanged;
  const urlError = validateUrl(url);
  const credentialError = needsCredential ? validateCredential(credential) : null;
  const caError = caCleared ? null : validateCa(ca);
  const canSave =
    url.trim() !== '' &&
    (!needsCredential || credential !== '') &&
    !urlError &&
    !credentialError &&
    !caError &&
    !changedElsewhere &&
    !busy;

  /** Closes a dialog and puts the focus back where the action started. */
  const closeNotice = (returnTo: React.RefObject<HTMLButtonElement | null>) => {
    setNotice(null);
    setTimeout(() => returnTo.current?.focus(), 0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: SettingsInput = { url: url.trim() };
    if (needsCredential) input.credential = credential;
    if (caChanged) input.caCertificate = ca.trim() === '' || caCleared ? null : ca.trim();
    setBusy(true);
    try {
      load(await onSave(input));
      setNotice({ kind: 'saved' });
    } catch (error) {
      setNotice({ kind: 'error', title: t('form.saveError'), message: messageOf(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
      load({ url: null, credentialConfigured: false, credentialUpdatedAt: null, caCertificate: null, updatedAt: null });
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', title: t('form.removeError'), message: messageOf(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-settings">
      <h2 className="mt:text-lg mt:font-semibold">{t('form.title')}</h2>
      {changedElsewhere && dirty && (
        <StatusAlert status="warning" title={t('form.changedElsewhere')} data-cy="matter-settings-stale">
          {t('form.changedElsewhereText')}
          <span className="mt:mt-2 mt:block">
            <Button size="sm" variant="secondary" onPress={() => load(settings)} data-cy="matter-settings-reload">
              {t('form.reload')}
            </Button>
          </span>
        </StatusAlert>
      )}
      <div>
        <Form onSubmit={submit} className="mt:flex mt:flex-col mt:gap-4">
          <TextField value={url} onChange={setUrl} className="mt:w-full" isRequired isInvalid={urlError !== null}>
            <Label>{t('form.url')}</Label>
            <Input placeholder={t('form.urlPlaceholder')} autoComplete="off" data-cy="matter-url-input" />
            <Description>{t('form.urlDescription')}</Description>
            {urlError && <FieldError data-cy="matter-url-error">{t(`form.validation.${urlError}`)}</FieldError>}
          </TextField>

          {needsCredential ? (
            <div className="mt:flex mt:flex-col mt:gap-2">
              <PasswordInput
                label={t('form.credential')}
                description={endpointChanged ? t('form.credentialReenter') : t('form.credentialDescription')}
                autoComplete="new-password"
                value={credential}
                onValueChange={setCredential}
                isInvalid={credentialError !== null}
                errorMessage={credentialError && <span data-cy="matter-credential-error">{t(`form.validation.${credentialError}`)}</span>}
                data-cy="matter-credential-input"
              />
              {base.credentialConfigured && !endpointChanged && (
                <Button variant="tertiary" onPress={() => setReplacing(false)} data-cy="matter-keep-credential">
                  {t('form.cancelReplace')}
                </Button>
              )}
            </div>
          ) : (
            <div
              className="mt:flex mt:flex-wrap mt:items-center mt:justify-between mt:gap-2"
              data-cy="matter-credential-configured"
            >
              <span>
                {t('form.credential')}:{' '}
                {t('form.credentialConfigured', { time: formatDateTime(base.credentialUpdatedAt) })}
              </span>
              <Button variant="secondary" onPress={() => setReplacing(true)} data-cy="matter-replace-credential">
                {t('form.replace')}
              </Button>
            </div>
          )}

          <TextField value={caCleared ? '' : ca} onChange={setCa} isDisabled={caCleared} className="mt:w-full" isInvalid={caError !== null}>
            <Label>{t('form.ca')}</Label>
            <TextArea rows={5} spellCheck={false} data-cy="matter-ca-input" />
            <Description>{caCleared ? t('form.caCleared') : t('form.caDescription')}</Description>
            {caError && <FieldError data-cy="matter-ca-error">{t(`form.validation.${caError}`)}</FieldError>}
          </TextField>
          {base.caCertificate && !caCleared && (
            <Button variant="tertiary" onPress={() => setCaCleared(true)} data-cy="matter-clear-ca">
              {t('form.caClear')}
            </Button>
          )}
          {caCleared && (
            <Button variant="tertiary" onPress={() => setCaCleared(false)} data-cy="matter-undo-clear-ca">
              {t('form.caUndo')}
            </Button>
          )}

          <div className="mt:flex mt:flex-wrap mt:gap-2">
            <Button ref={saveRef} type="submit" isDisabled={!canSave} isPending={busy} data-cy="matter-save">
              {t('form.save')}
            </Button>
            {base.url !== null && (
              <Button
                ref={removeRef}
                variant="danger-soft"
                isDisabled={busy}
                onPress={() => setNotice({ kind: 'remove' })}
                data-cy="matter-remove"
              >
                {t('form.remove')}
              </Button>
            )}
          </div>
        </Form>
      </div>

      <StatusDialog
        isOpen={notice?.kind === 'saved'}
        status="success"
        title={t('form.saved')}
        onClose={() => closeNotice(saveRef)}
        data-cy="matter-saved-dialog"
      >
        {t('form.savedText')}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'error'}
        status="error"
        title={notice?.kind === 'error' ? notice.title : ''}
        onClose={() => closeNotice(saveRef)}
        data-cy="matter-error-dialog"
      >
        {notice?.kind === 'error' ? notice.message : ''}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'remove'}
        status="warning"
        title={t('form.removeTitle')}
        onClose={() => closeNotice(removeRef)}
        action={{
          label: t('form.removeConfirm'),
          isPending: busy,
          onPress: async () => {
            setNotice(null);
            await remove();
          },
        }}
        data-cy="matter-remove-dialog"
      >
        {t('form.removeText')}
      </StatusDialog>
    </section>
  );
}
