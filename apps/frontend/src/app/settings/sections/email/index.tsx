import { Link } from 'react-router-dom';
import { Chip, FieldError, Form, Input, Spinner, TextField } from '@heroui/react';
import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { SmtpServiceType } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { Select } from '../../../../components/select';
import { PasswordInput } from '../../../../components/PasswordInput';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { OUTLOOK_HOST } from './index.state';
import { OUTLOOK_PORT } from './index.state';
import { useEmailSectionState } from './useEmailSectionState';

/**
 * Outgoing mail. Templates and the shared layout are sub-routes rather than panels — both are
 * full-screen editors, not settings — so this section is only the SMTP transport.
 */
export function EmailSection() {
  const model = useEmailSectionState();

  if (model.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {model.t('loading')}
      </div>
    );
  }

  const aside = (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{model.t('aside.statusTitle')}</h3>
        <div>
          <Chip color={model.settings?.smtp.passConfigured ? 'success' : 'warning'} variant="soft">
            <span className="flex items-center gap-1">
              {model.settings?.smtp.passConfigured ? <CheckIcon size={14} /> : <XIcon size={14} />}
              {model.settings?.smtp.passConfigured
                ? model.t('passwordStatus.configured')
                : model.t('passwordStatus.missing')}
            </span>
          </Chip>
        </div>
        <p className="text-xs text-muted">{model.t('aside.statusHint')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{model.t('aside.contentTitle')}</h3>
        {(
          [
            { to: '/settings/email/templates', key: 'templates' },
            { to: '/settings/email/layout', key: 'layout' },
          ] as const
        ).map(({ to, key }) => (
          <Link
            key={key}
            to={to}
            className="flex items-center justify-between gap-2 border-b border-separator py-2 last:border-b-0"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">{model.t(`subPages.${key}.title`)}</span>
              <span className="text-xs text-muted">{model.t(`subPages.${key}.description`)}</span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </>
  );

  return (
    <SettingsSection title={model.t('title')} description={model.t('description')} aside={aside}>
      {/* validationBehavior="aria" for the same reason as General: in "native" mode the browser's
          constraint check swallows implicit submission before onSubmit runs, and react-aria
          suppresses the bubble, so Enter would silently do nothing. */}
      <Form
        validationBehavior="aria"
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          model.handleSave();
        }}
      >
        <SettingsRow label={model.t('inputs.service.label')} hint={model.t('inputs.service.description')}>
          <Select
            aria-label={model.t('inputs.service.label')}
            value={model.service}
            onChange={(key) =>
              model.setDraft((current) =>
                // Choosing Outlook fills in the host and port Microsoft accepts, as a visible draft
                // edit rather than a pin — so it shows in the save bar and Discard undoes it.
                // Switching back drops those two keys rather than leaving them in the draft: they
                // derive draft-then-stored, so surviving constants would mask the instance's real
                // relay and Save would repoint outbound mail at smtp.office365.com. Undefined makes
                // the round trip a no-op instead of a change.
                key === SmtpServiceType.OUTLOOK365
                  ? { ...current, service: key, host: OUTLOOK_HOST, port: OUTLOOK_PORT }
                  : { ...current, service: key, host: undefined, port: undefined },
              )
            }
            items={[
              { key: SmtpServiceType.SMTP, label: model.t('service.smtp') },
              { key: SmtpServiceType.OUTLOOK365, label: model.t('service.outlook') },
            ]}
          />
        </SettingsRow>

        <SettingsRow stacked label={model.t('inputs.host.label')} hint={model.t('inputs.host.description')}>
          <TextField
            className="w-full"
            aria-label={model.t('inputs.host.label')}
            value={model.host}
            isDisabled={model.isOutlook}
            isInvalid={model.hasAttemptedSave && !!model.hostError}
            onChange={(next) => model.setDraft((current) => ({ ...current, host: next }))}
          >
            <Input />
            <FieldError>{model.hostError}</FieldError>
          </TextField>
        </SettingsRow>

        <SettingsRow label={model.t('inputs.port.label')} hint={model.t('inputs.port.description')}>
          <TextField
            aria-label={model.t('inputs.port.label')}
            value={model.port}
            isDisabled={model.isOutlook}
            isInvalid={model.hasAttemptedSave && !!model.portError}
            onChange={(next) => model.setDraft((current) => ({ ...current, port: next }))}
          >
            <Input inputMode="numeric" />
            <FieldError>{model.portError}</FieldError>
          </TextField>
        </SettingsRow>

        <SettingsRow label={model.t('inputs.secure.label')} hint={model.t('inputs.secure.description')}>
          <LabeledSwitch
            aria-label={model.t('inputs.secure.label')}
            isSelected={model.secure}
            isDisabled={model.isOutlook}
            onChange={(next) => model.setDraft((current) => ({ ...current, secure: next }))}
          />
        </SettingsRow>

        <SettingsRow stacked label={model.t('inputs.user.label')} hint={model.t('inputs.user.description')}>
          <TextField
            className="w-full"
            aria-label={model.t('inputs.user.label')}
            value={model.user}
            onChange={(next) => model.setDraft((current) => ({ ...current, user: next }))}
          >
            <Input autoComplete="off" />
          </TextField>
        </SettingsRow>

        <SettingsRow stacked label={model.t('inputs.pass.label')} hint={model.t('inputs.pass.description')}>
          <PasswordInput
            className="w-full"
            aria-label={model.t('inputs.pass.label')}
            autoComplete="off"
            value={model.pass}
            onChange={(next) => model.setDraft((current) => ({ ...current, pass: next }))}
          />
        </SettingsRow>

        <SettingsRow stacked label={model.t('inputs.from.label')} hint={model.t('inputs.from.description')}>
          <TextField
            className="w-full"
            aria-label={model.t('inputs.from.label')}
            value={model.from}
            isInvalid={model.hasAttemptedSave && !!model.fromError}
            onChange={(next) => model.setDraft((current) => ({ ...current, from: next }))}
          >
            <Input />
            <FieldError>{model.fromError}</FieldError>
          </TextField>
        </SettingsRow>
        <input type="submit" hidden />
      </Form>

      <SettingsSaveBar
        isDirty={model.isDirty}
        isSaving={model.isSaving}
        onSave={model.handleSave}
        onDiscard={() => model.setDraft({})}
      />
    </SettingsSection>
  );
}

export default EmailSection;
