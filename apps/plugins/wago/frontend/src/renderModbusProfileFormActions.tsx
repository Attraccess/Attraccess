import { Button } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import { Field } from './ModbusConfigurationForm.choice.helpers';
import { Choice } from './ModbusConfigurationForm.choice.helpers';
import { FormatFields } from './ModbusConfigurationForm.choice.helpers';
import { useModbusProfileFormState } from './useModbusProfileFormState';
type Model = ReturnType<typeof useModbusProfileFormState>;
type Props = Pick<
  Model,
  'onChange' | 'value' | 'collapseSignals' | 't' | 'tBackendMessage' | 'showIdentifiers' | 'readonly'
>;
export function renderModbusProfileFormActions(
  a: NonNullable<Model['value']>['actions'][number],
  index: number,
  { onChange, value, collapseSignals, t, tBackendMessage, showIdentifiers, readonly }: Props,
) {
  const update = (patch: Partial<typeof a>) =>
    onChange({
      ...value,
      actions: value.actions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <details key={index} open={!collapseSignals} className="wg:rounded-lg wg:border wg:border-border wg:p-3">
      <summary className="wg:cursor-pointer wg:font-medium">
        {t('modbus.actionTitle', { name: modbusDisplayName(value, a.name, tBackendMessage) })}
      </summary>
      <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
        {showIdentifiers && (
          <Field label={t('modbus.actionId')} value={a.id} disabled={readonly} onChange={(id) => update({ id })} />
        )}
        <Field
          label={t('modbus.name')}
          value={modbusDisplayName(value, a.name, tBackendMessage)}
          disabled={readonly}
          onChange={(name) => update({ name })}
        />
        <Choice
          label={t('modbus.writeFunction')}
          value={a.functionCode}
          options={[5, 6, 16]}
          disabled={readonly}
          onChange={(v) => update({ functionCode: Number(v) as 5 | 6 | 16 })}
        />
        <FormatFields value={a} disabled={readonly} onChange={update} />
        <Field
          label={t('modbus.onValue')}
          value={a.onValue}
          numeric
          disabled={readonly}
          onChange={(v) => update({ onValue: Number(v) })}
        />
        <Field
          label={t('modbus.offValue')}
          value={a.offValue}
          numeric
          disabled={readonly}
          onChange={(v) => update({ offValue: Number(v) })}
        />
        <Button
          isDisabled={readonly}
          variant="danger"
          onPress={() => onChange({ ...value, actions: value.actions.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeAction')}
        </Button>
      </div>
    </details>
  );
}
