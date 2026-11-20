import { Button, ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import type { ConnectionSettings, SettingsInput } from './api';
import { useMatterTranslations } from './i18n';
import { CaField } from './settings/CaField';
import { CredentialField } from './settings/CredentialField';
import { SettingsDialogs, type SettingsNotice } from './settings/SettingsDialogs';
import { useSettingsDraft } from './settings/useSettingsDraft';
import { errorMessage } from './errorMessage';

type Props = Readonly<{
  /** The settings as the server has them now. They are polled: a change made elsewhere arrives here as a new value. */
  settings: ConnectionSettings;
  /** Resolves with the settings as stored, which the form then shows. */
  onSave: (input: SettingsInput) => Promise<ConnectionSettings>;
  onRemove: () => Promise<void>;
}>;

const EMPTY: ConnectionSettings = {
  url: null,
  credentialConfigured: false,
  credentialUpdatedAt: null,
  caCertificate: null,
  updatedAt: null,
};

/**
 * The connection settings form. The token is write-only (see CredentialField); changing the URL or the CA certificate
 * needs it again, so a stored token never goes to a new endpoint.
 *
 * The form is a draft of the settings it was loaded from (see useSettingsDraft). When another administrator saves
 * meanwhile, an untouched form adopts the new settings; a form with edits keeps them, says so and blocks Save until the
 * administrator reloads, so nothing is overwritten silently. URL, token and CA certificate are checked while typing.
 * After a dialog closes, the focus returns to the control that started the action.
 */
export function SettingsForm({ settings, onSave, onRemove }: Props) {
  const { t } = useMatterTranslations();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const draft = useSettingsDraft(settings, busy);
  const saveRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // The browser may have dropped the focus meanwhile (the button was disabled while the request ran, or it is gone), so
  // the focus is put back explicitly, after the dialog has closed.
  const focusLater = (target: RefObject<HTMLElement | null>) => setTimeout(() => target.current?.focus(), 0);

  /** Closes a dialog and puts the focus back where the action started. */
  const closeNotice = (returnTo: RefObject<HTMLElement | null>) => {
    setNotice(null);
    focusLater(returnTo);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      draft.load(await onSave(draft.input()));
      setNotice({ kind: 'saved' });
    } catch (error) {
      setNotice({ kind: 'error', title: t('form.saveError'), message: errorMessage(error), returnTo: 'save' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
      draft.load(EMPTY);
      // Remove is gone now (nothing is configured): the focus goes to the URL, where the next step starts.
      focusLater(urlRef);
    } catch (error) {
      setNotice({ kind: 'error', title: t('form.removeError'), message: errorMessage(error), returnTo: 'remove' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-settings">
      <h2 className="mt:text-lg mt:font-semibold">{t('form.title')}</h2>
      {draft.changedElsewhere && draft.dirty && (
        <StatusAlert status="warning" title={t('form.changedElsewhere')} data-cy="matter-settings-stale">
          {t('form.changedElsewhereText')}
          <span className="mt:mt-2 mt:block">
            <Button size="sm" variant="secondary" onPress={() => draft.load(settings)} data-cy="matter-settings-reload">
              {t('form.reload')}
            </Button>
          </span>
        </StatusAlert>
      )}
      <Form onSubmit={submit} className="mt:flex mt:flex-col mt:gap-4">
        <TextField
          value={draft.url}
          onChange={draft.setUrl}
          className="mt:w-full"
          isRequired
          isInvalid={draft.urlError !== null}
        >
          <Label>{t('form.url')}</Label>
          <Input ref={urlRef} placeholder={t('form.urlPlaceholder')} autoComplete="off" data-cy="matter-url-input" />
          <Description>{t('form.urlDescription')}</Description>
          {draft.urlError && (
            <FieldError data-cy="matter-url-error">{t(`form.validation.${draft.urlError}`)}</FieldError>
          )}
        </TextField>
        <CredentialField
          configured={draft.base.credentialConfigured}
          configuredAt={draft.base.credentialUpdatedAt}
          needed={draft.needsCredential}
          endpointChanged={draft.endpointChanged}
          value={draft.credential}
          error={draft.credentialError}
          onChange={draft.setCredential}
          onReplacingChange={draft.setReplacing}
        />
        <CaField
          value={draft.ca}
          stored={draft.base.caCertificate !== null}
          cleared={draft.caCleared}
          error={draft.caError}
          onChange={draft.setCa}
          onClearedChange={draft.setCaCleared}
        />
        <div className="mt:flex mt:flex-wrap mt:gap-2">
          <Button ref={saveRef} type="submit" isDisabled={!draft.canSave} isPending={busy} data-cy="matter-save">
            {t('form.save')}
          </Button>
          {draft.base.url !== null && (
            <ConfirmableButton
              label={t('form.remove')}
              status="error"
              isDisabled={busy}
              onConfirm={remove}
              confirm={{
                title: t('form.removeTitle'),
                message: t('form.removeText'),
                confirmLabel: t('form.removeConfirm'),
                'data-cy': 'matter-remove-dialog',
              }}
              buttonProps={{ ref: removeRef, variant: 'danger-soft' }}
              data-cy="matter-remove"
            />
          )}
        </div>
      </Form>
      <SettingsDialogs
        notice={notice}
        onCloseSaved={() => closeNotice(saveRef)}
        onCloseError={() => closeNotice(notice?.kind === 'error' && notice.returnTo === 'remove' ? removeRef : saveRef)}
      />
    </section>
  );
}
