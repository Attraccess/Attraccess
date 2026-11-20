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
}

export function ModbusActionForm({ profile, action: a, index, onChange }: ModbusActionFormProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  const update = (patch: Partial<ModbusAction>) =>
    onChange({
      ...profile,
      actions: profile.actions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <details className="wg:rounded-lg wg:border wg:border-border wg:p-3">
      <summary className="wg:cursor-pointer wg:font-medium">
        {t('modbus.actionTitle', { name: modbusDisplayName(profile, a.name, tBackendMessage) })}
      </summary>
      <div className="wg:flex wg:flex-col wg:gap-3 wg:pt-3">
        <Field
          label={t('modbus.name')}
          value={modbusDisplayName(profile, a.name, tBackendMessage)}
          onChange={(name) => update({ name })}
        />
        <Choice
          label={t('modbus.writeFunction')}
          value={a.functionCode}
          options={[5, 6, 16]}
          onChange={(v) => update({ functionCode: Number(v) as 5 | 6 | 16 })}
        />
        <FormatFields value={a} onChange={update} />
        <Field label={t('modbus.onValue')} value={a.onValue} numeric onChange={(v) => update({ onValue: Number(v) })} />
        <Field
          label={t('modbus.offValue')}
          value={a.offValue}
          numeric
          onChange={(v) => update({ offValue: Number(v) })}
        />
        <Button
          variant="danger"
          onPress={() => onChange({ ...profile, actions: profile.actions.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeAction')}
        </Button>
      </div>
    </details>
  );
}
