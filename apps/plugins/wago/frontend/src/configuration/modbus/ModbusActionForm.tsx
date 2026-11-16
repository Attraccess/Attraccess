import { Button } from '@heroui/react';
import type { ModbusAction, ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { Choice } from './Choice';
import { Field } from './Field';
import { FormatFields } from './FormatFields';
import { modbusDisplayName } from './modbus-labels';

interface ModbusActionFormProps {
  profile: ModbusProfile;
  action: ModbusAction;
  index: number;
  onChange: (value: ModbusProfile) => void;
  collapseSignals: boolean;
  showIdentifiers: boolean;
  readonly: boolean;
}

export function ModbusActionForm({
  profile,
  action: a,
  index,
  onChange,
  collapseSignals,
  showIdentifiers,
  readonly,
}: ModbusActionFormProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  const update = (patch: Partial<ModbusAction>) =>
    onChange({
      ...profile,
      actions: profile.actions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <details open={!collapseSignals} className="wg:rounded-lg wg:border wg:border-border wg:p-3">
      <summary className="wg:cursor-pointer wg:font-medium">
        {t('modbus.actionTitle', { name: modbusDisplayName(profile, a.name, tBackendMessage) })}
      </summary>
      <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
        {showIdentifiers && (
          <Field label={t('modbus.actionId')} value={a.id} disabled={readonly} onChange={(id) => update({ id })} />
        )}
        <Field
          label={t('modbus.name')}
          value={modbusDisplayName(profile, a.name, tBackendMessage)}
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
          onPress={() => onChange({ ...profile, actions: profile.actions.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeAction')}
        </Button>
      </div>
    </details>
  );
}
