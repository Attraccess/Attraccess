import { Button, PasswordInput, StatusDialog, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Description, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { useState, type FormEvent } from 'react';
import type { ConnectionSettings, SettingsInput } from './api';
import { useMatterTranslations } from './i18n';

type Props = Readonly<{
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
 */
export function SettingsForm({ settings, onSave, onRemove }: Props) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({});
  const [url, setUrl] = useState(settings.url ?? '');
  const [replacing, setReplacing] = useState(!settings.credentialConfigured);
  const [credential, setCredential] = useState('');
  const [ca, setCa] = useState(settings.caCertificate ?? '');
  const [caCleared, setCaCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const caChanged = caCleared || ca.trim() !== (settings.caCertificate ?? '').trim();
  const endpointChanged =
    settings.credentialConfigured &&
    (caChanged || (settings.url !== null && normalizedUrl(url) !== normalizedUrl(settings.url)));
  const needsCredential = replacing || endpointChanged;
  const canSave = url.trim() !== '' && (!needsCredential || credential !== '') && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: SettingsInput = { url: url.trim() };
    if (needsCredential) input.credential = credential;
    if (caChanged) input.caCertificate = ca.trim() === '' || caCleared ? null : ca.trim();
    setBusy(true);
    try {
      const saved = await onSave(input);
      setUrl(saved.url ?? '');
      setCa(saved.caCertificate ?? '');
      setCaCleared(false);
      setCredential('');
      setReplacing(!saved.credentialConfigured);
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
      setUrl('');
      setCa('');
      setCaCleared(false);
      setCredential('');
      setReplacing(true);
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
      <div>
        <Form onSubmit={submit} className="mt:flex mt:flex-col mt:gap-4">
          <TextField value={url} onChange={setUrl} className="mt:w-full" isRequired>
            <Label>{t('form.url')}</Label>
            <Input placeholder={t('form.urlPlaceholder')} autoComplete="off" data-cy="matter-url-input" />
            <Description>{t('form.urlDescription')}</Description>
          </TextField>

          {needsCredential ? (
            <div className="mt:flex mt:flex-col mt:gap-2">
              <PasswordInput
                label={t('form.credential')}
                description={endpointChanged ? t('form.credentialReenter') : t('form.credentialDescription')}
                autoComplete="new-password"
                value={credential}
                onValueChange={setCredential}
                data-cy="matter-credential-input"
              />
              {settings.credentialConfigured && !endpointChanged && (
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
                {t('form.credentialConfigured', { time: formatDateTime(settings.credentialUpdatedAt) })}
              </span>
              <Button variant="secondary" onPress={() => setReplacing(true)} data-cy="matter-replace-credential">
                {t('form.replace')}
              </Button>
            </div>
          )}

          <TextField value={caCleared ? '' : ca} onChange={setCa} isDisabled={caCleared} className="mt:w-full">
            <Label>{t('form.ca')}</Label>
            <TextArea rows={5} spellCheck={false} data-cy="matter-ca-input" />
            <Description>{caCleared ? t('form.caCleared') : t('form.caDescription')}</Description>
          </TextField>
          {settings.caCertificate && !caCleared && (
            <Button variant="tertiary" onPress={() => setCaCleared(true)} data-cy="matter-clear-ca">
              {t('form.caClear')}
            </Button>
          )}

          <div className="mt:flex mt:flex-wrap mt:gap-2">
            <Button type="submit" isDisabled={!canSave} isPending={busy} data-cy="matter-save">
              {t('form.save')}
            </Button>
            {settings.url !== null && (
              <Button
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
        onClose={() => setNotice(null)}
        data-cy="matter-saved-dialog"
      >
        {t('form.savedText')}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'error'}
        status="error"
        title={notice?.kind === 'error' ? notice.title : ''}
        onClose={() => setNotice(null)}
        data-cy="matter-error-dialog"
      >
        {notice?.kind === 'error' ? notice.message : ''}
      </StatusDialog>
      <StatusDialog
        isOpen={notice?.kind === 'remove'}
        status="warning"
        title={t('form.removeTitle')}
        onClose={() => setNotice(null)}
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
