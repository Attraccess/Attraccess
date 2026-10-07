import { SmtpServiceType } from '@attraccess/react-query-client';
import { Form, TextField, Label, Input, Description, Spinner } from '@heroui/react';
import { Button } from '../../../../components/button';
import { PasswordInput } from '../../../../components/PasswordInput';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { Select } from '../../../../components/select';
import type { SmtpSettingsFormVariant } from './index.contracts';
import { SmtpSettingsFormProps } from './index.contracts';
import { useSmtpSettingsFormState } from './useSmtpSettingsFormState';

export function SmtpSettingsForm({ variant, endpoint, onNext }: SmtpSettingsFormProps) {
  const {
    t,
    formRef,
    smtpService,
    setSmtpService,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    smtpSecure,
    setSmtpSecure,
    smtpUser,
    setSmtpUser,
    smtpFrom,
    setSmtpFrom,
    smtpPass,
    setSmtpPass,
    isSaving,
    handleSubmit,
    smtpServiceOptions,
    showLoading,
  } = useSmtpSettingsFormState({ variant, endpoint, onNext });

  if (showLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <Select
        label={t('inputs.service.label')}
        value={smtpService}
        onChange={(key) => {
          const next = key as SmtpServiceType;
          setSmtpService(next);
          if (next === SmtpServiceType.OUTLOOK365) {
            setSmtpHost('smtp.office365.com');
            setSmtpPort('587');
          }
        }}
        items={smtpServiceOptions}
        isRequired
      />
      <TextField isRequired isDisabled={smtpService !== SmtpServiceType.SMTP} value={smtpHost} onChange={setSmtpHost}>
        <Label>{t('inputs.host.label')}</Label>
        <Input />
        <Description>{t('inputs.host.description')}</Description>
      </TextField>
      <TextField isRequired isDisabled={smtpService !== SmtpServiceType.SMTP} value={smtpPort} onChange={setSmtpPort}>
        <Label>{t('inputs.port.label')}</Label>
        <Input type="number" min={1} />
        <Description>{t('inputs.port.description')}</Description>
      </TextField>
      <LabeledSwitch isSelected={smtpSecure} onChange={setSmtpSecure} isDisabled={smtpService !== SmtpServiceType.SMTP}>
        {t('inputs.secure.label')}
      </LabeledSwitch>
      <TextField value={smtpUser} onChange={setSmtpUser}>
        <Label>{t('inputs.user.label')}</Label>
        <Input />
        <Description>{t('inputs.user.description')}</Description>
      </TextField>
      <PasswordInput
        label={t('inputs.pass.label')}
        description={t('inputs.pass.description')}
        value={smtpPass}
        onChange={setSmtpPass}
        autoComplete="off"
      />
      <TextField isRequired value={smtpFrom} onChange={setSmtpFrom}>
        <Label>{t('inputs.from.label')}</Label>
        <Input />
        <Description>{t('inputs.from.description')}</Description>
      </TextField>
      <Button variant="primary" onPress={handleSubmit} isPending={isSaving} isDisabled={showLoading}>
        {variant === 'wizard' ? t('actions.next') : t('actions.save')}
      </Button>
      <input type="submit" hidden />
    </Form>
  );
}

export { type SmtpSettingsFormVariant };
export { type SmtpSettingsFormProps } from './index.contracts';
