import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import { useEditMqttServerPageState } from './useEditMqttServerPageState';
type Props = Pick<
  ReturnType<typeof useEditMqttServerPageState>,
  't' | 'formValues' | 'setFormValues' | 'managementPortInput' | 'setManagementPortInput' | 'managementPort'
>;
export function EditMqttServerPageEditMqttServerFormNameInput({
  t,
  formValues,
  setFormValues,
  managementPortInput,
  setManagementPortInput,
  managementPort,
}: Props) {
  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.connection')}</h3>
      <TextField value={formValues.name} onChange={(v) => setFormValues((p) => ({ ...p, name: v }))} className="w-full">
        <Label>{t('nameLabel')}</Label>
        <Input
          id="name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
          data-cy="edit-mqtt-server-form-name-input"
        />
      </TextField>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <TextField
          value={formValues.host}
          onChange={(v) => setFormValues((p) => ({ ...p, host: v }))}
          className="md:col-span-2"
        >
          <Label>{t('hostLabel')}</Label>
          <Input
            id="host"
            name="host"
            placeholder={t('hostPlaceholder')}
            required
            data-cy="edit-mqtt-server-form-host-input"
          />
        </TextField>

        <TextField
          value={String(formValues.port || 1883)}
          onChange={(v) => setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}
        >
          <Label>{t('portLabel')}</Label>
          <Input
            id="port"
            name="port"
            type="number"
            placeholder={t('portPlaceholder')}
            required
            data-cy="edit-mqtt-server-form-port-input"
          />
        </TextField>
      </div>
      <TextField
        value={managementPortInput}
        onChange={setManagementPortInput}
        isInvalid={managementPort === undefined}
        className="w-full"
      >
        <Label>{t('managementPortLabel')}</Label>
        <Input
          name="managementPort"
          type="number"
          min={1}
          max={65535}
          step={1}
          data-cy="edit-mqtt-server-form-management-port-input"
        />
        <Description>{t('managementPortDescription')}</Description>
        <FieldError>{t('managementPortInvalid')}</FieldError>
      </TextField>
    </section>
  );
}
