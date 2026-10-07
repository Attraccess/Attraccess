import { randomUUID } from './configuration-id';
import { Button } from '@heroui/react';
import { modbusDisplayName } from './modbus-labels';
import { type ModbusProfile } from '../../modbus/model';
import { emptyFormat } from './ModbusConfigurationForm.empty-format';
import { Field } from './ModbusConfigurationForm.choice.helpers';
import { useModbusProfileFormState } from './useModbusProfileFormState';
import { renderModbusProfileFormMeasurements } from './renderModbusProfileFormMeasurements';
import { renderModbusProfileFormActions } from './renderModbusProfileFormActions';

export function ModbusProfileForm({
  value,
  onChange,
  isDisabled = false,
  showIdentifiers = true,
  collapseSignals = false,
}: {
  value: ModbusProfile;
  onChange: (value: ModbusProfile) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
  collapseSignals?: boolean;
}) {
  const { t, tBackendMessage, readonly } = useModbusProfileFormState({
    value,
    onChange,
    isDisabled,
    showIdentifiers,
    collapseSignals,
  });

  return (
    <section className="wg:flex wg:flex-col wg:gap-4">
      <header>
        <h3>{modbusDisplayName(value, value.name, tBackendMessage)}</h3>
        <p>{t(readonly ? 'modbus.readonly' : 'modbus.customHint')}</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-4">
        {showIdentifiers && (
          <Field
            label={t('modbus.profileId')}
            value={value.id}
            disabled={readonly}
            onChange={(id) => onChange({ ...value, id })}
          />
        )}
        <Field
          label={t('modbus.profileName')}
          value={modbusDisplayName(value, value.name, tBackendMessage)}
          disabled={readonly}
          onChange={(name) => onChange({ ...value, name })}
        />
        <Field
          label={t('modbus.version')}
          value={value.version}
          numeric
          disabled={readonly}
          onChange={(v) => onChange({ ...value, version: Number(v) })}
        />
        {value.measurements.map((m, index) =>
          renderModbusProfileFormMeasurements(m, index, {
            onChange,
            value,
            collapseSignals,
            t,
            tBackendMessage,
            showIdentifiers,
            readonly,
          }),
        )}
        <Button
          isDisabled={readonly}
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
        {value.actions.map((a, index) =>
          renderModbusProfileFormActions(a, index, {
            onChange,
            value,
            collapseSignals,
            t,
            tBackendMessage,
            showIdentifiers,
            readonly,
          }),
        )}
        <Button
          isDisabled={readonly}
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
