import { randomUUID } from '../identity';
import { Button } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import type { ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { emptyFormat } from './emptyFormat';
import { Field } from './Field';
import { ModbusActionForm } from './ModbusActionForm';
import { ModbusMeasurementForm } from './ModbusMeasurementForm';

export function ModbusProfileForm({
  value,
  onChange,
}: {
  value: ModbusProfile;
  onChange: (value: ModbusProfile) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();

  return (
    <section className="wg:flex wg:flex-col wg:gap-4">
      <header>
        <h3>{modbusDisplayName(value, value.name, tBackendMessage)}</h3>
        <p>{t('modbus.customHint')}</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-4">
        <Field
          label={t('modbus.profileName')}
          value={modbusDisplayName(value, value.name, tBackendMessage)}
          onChange={(name) => onChange({ ...value, name })}
        />
        <Field
          label={t('modbus.version')}
          value={value.version}
          numeric
          onChange={(v) => onChange({ ...value, version: Number(v) })}
        />
        {value.measurements.map((m, index) => (
          <ModbusMeasurementForm key={index} profile={value} measurement={m} index={index} onChange={onChange} />
        ))}
        <Button
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              measurements: [
                ...value.measurements,
                {
                  ...emptyFormat,
                  id: randomUUID(),
                  name: t('modbus.defaultMeasurement'),
                  functionCode: 3,
                  unit: 'watt',
                  kind: 'live',
                  pollIntervalMs: 5000,
                },
              ],
            })
          }
        >
          {t('modbus.addMeasurement')}
        </Button>
        {value.actions.map((a, index) => (
          <ModbusActionForm key={index} profile={value} action={a} index={index} onChange={onChange} />
        ))}
        <Button
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              actions: [
                ...value.actions,
                {
                  ...emptyFormat,
                  id: randomUUID(),
                  name: t('modbus.defaultAction'),
                  functionCode: 5,
                  onValue: 1,
                  offValue: 0,
                },
              ],
            })
          }
        >
          {t('modbus.addAction')}
        </Button>
      </div>
    </section>
  );
}
