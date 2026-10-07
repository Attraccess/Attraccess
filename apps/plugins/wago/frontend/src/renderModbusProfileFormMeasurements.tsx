import { ENGINEERING_UNITS } from '../../measurement-contract';
import { Button } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import { Field } from './ModbusConfigurationForm.choice.helpers';
import { Choice } from './ModbusConfigurationForm.choice.helpers';
import { FormatFields } from './ModbusConfigurationForm.choice.helpers';
import { SignalDisclosure } from './ModbusConfigurationForm.modbus-point-form.helpers';
import { useModbusProfileFormState } from './useModbusProfileFormState';
type Model = ReturnType<typeof useModbusProfileFormState>;
type Props = Pick<
  Model,
  'onChange' | 'value' | 'collapseSignals' | 't' | 'tBackendMessage' | 'showIdentifiers' | 'readonly'
>;
export function renderModbusProfileFormMeasurements(
  m: NonNullable<Model['value']>['measurements'][number],
  index: number,
  { onChange, value, collapseSignals, t, tBackendMessage, showIdentifiers, readonly }: Props,
) {
  const update = (patch: Partial<typeof m>) =>
    onChange({
      ...value,
      measurements: value.measurements.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <SignalDisclosure
      key={index}
      defaultExpanded={!collapseSignals && (value.measurements.length <= 16 || index < 5)}
      label={t('modbus.measurementTitle', { name: modbusDisplayName(value, m.name, tBackendMessage) })}
    >
      <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
        {showIdentifiers && (
          <Field label={t('modbus.measurementId')} value={m.id} disabled={readonly} onChange={(id) => update({ id })} />
        )}
        <Field
          label={t('modbus.name')}
          value={modbusDisplayName(value, m.name, tBackendMessage)}
          disabled={readonly}
          onChange={(name) => update({ name })}
        />
        <Choice
          label={t('modbus.readFunction')}
          value={m.functionCode}
          options={[3, 4]}
          disabled={readonly}
          onChange={(v) => update({ functionCode: Number(v) as 3 | 4 })}
        />
        <FormatFields value={m} disabled={readonly} onChange={update} />
        <Choice
          label={t('modbus.numericEncoding')}
          value={m.encoding ?? 'binary'}
          options={['binary', 'bcd']}
          disabled={readonly}
          onChange={(v) => update({ encoding: v === 'bcd' ? 'bcd' : undefined })}
        />
        <Choice
          label={t('modbus.unit')}
          value={m.unit}
          options={ENGINEERING_UNITS}
          disabled={readonly}
          onChange={(v) => update({ unit: v as typeof m.unit })}
        />
        <Choice
          label={t('modbus.kind')}
          value={m.kind}
          options={['live', 'cumulative']}
          disabled={readonly}
          onChange={(v) => {
            update({ kind: v as typeof m.kind, rollover: v === 'live' ? undefined : m.rollover });
          }}
        />
        <Choice
          label={t('modbus.precision')}
          value={m.decimalPlaces ?? 'exact'}
          options={['exact', 0, 1, 2, 3]}
          labels={{
            exact: t('modbus.exact'),
            0: t('modbus.whole'),
            1: t('modbus.units', { precision: '0.1' }),
            2: t('modbus.units', { precision: '0.01' }),
            3: t('modbus.units', { precision: '0.001' }),
          }}
          disabled={readonly}
          onChange={(v) => update({ decimalPlaces: v === 'exact' ? undefined : Number(v) })}
        />
        <Field
          label={t('modbus.polling')}
          value={m.pollIntervalMs}
          numeric
          disabled={readonly}
          onChange={(v) => update({ pollIntervalMs: Number(v) })}
        />
        {m.kind === 'cumulative' && (
          <Field
            label={t('modbus.rollover')}
            allowEmpty
            value={m.rollover ?? ''}
            numeric
            disabled={readonly}
            onChange={(v) => update({ rollover: v === '' ? undefined : Number(v) })}
          />
        )}
        <Button
          isDisabled={readonly}
          variant="danger"
          onPress={() => onChange({ ...value, measurements: value.measurements.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeMeasurement')}
        </Button>
      </div>
    </SignalDisclosure>
  );
}
