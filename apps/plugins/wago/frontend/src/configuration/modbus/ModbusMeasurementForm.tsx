import { Button } from '@heroui/react';
import { ENGINEERING_UNITS } from '../../../../measurement-contract';
import type { ModbusMeasurement, ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { Choice } from './Choice';
import { Field } from './Field';
import { FormatFields } from './FormatFields';
import { modbusDisplayName } from './modbus-labels';
import { SignalDisclosure } from './SignalDisclosure';

interface ModbusMeasurementFormProps {
  profile: ModbusProfile;
  measurement: ModbusMeasurement;
  index: number;
  onChange: (value: ModbusProfile) => void;
}

export function ModbusMeasurementForm({ profile, measurement: m, index, onChange }: ModbusMeasurementFormProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  const update = (patch: Partial<ModbusMeasurement>) =>
    onChange({
      ...profile,
      measurements: profile.measurements.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <SignalDisclosure
      label={t('modbus.measurementTitle', { name: modbusDisplayName(profile, m.name, tBackendMessage) })}
    >
      <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
        <Field
          label={t('modbus.name')}
          value={modbusDisplayName(profile, m.name, tBackendMessage)}
          onChange={(name) => update({ name })}
        />
        <Choice
          label={t('modbus.readFunction')}
          value={m.functionCode}
          options={[3, 4]}
          onChange={(v) => update({ functionCode: Number(v) as 3 | 4 })}
        />
        <FormatFields value={m} onChange={update} />
        <Choice
          label={t('modbus.numericEncoding')}
          value={m.encoding ?? 'binary'}
          options={['binary', 'bcd']}
          onChange={(v) => update({ encoding: v === 'bcd' ? 'bcd' : undefined })}
        />
        <Choice
          label={t('modbus.unit')}
          value={m.unit}
          options={ENGINEERING_UNITS}
          onChange={(v) => update({ unit: v as typeof m.unit })}
        />
        <Choice
          label={t('modbus.kind')}
          value={m.kind}
          options={['live', 'cumulative']}
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
          onChange={(v) => update({ decimalPlaces: v === 'exact' ? undefined : Number(v) })}
        />
        <Field
          label={t('modbus.polling')}
          value={m.pollIntervalMs}
          numeric
          onChange={(v) => update({ pollIntervalMs: Number(v) })}
        />
        {m.kind === 'cumulative' && (
          <Field
            label={t('modbus.rollover')}
            allowEmpty
            value={m.rollover ?? ''}
            numeric
            onChange={(v) => update({ rollover: v === '' ? undefined : Number(v) })}
          />
        )}
        <Button
          variant="danger"
          onPress={() => onChange({ ...profile, measurements: profile.measurements.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeMeasurement')}
        </Button>
      </div>
    </SignalDisclosure>
  );
}
