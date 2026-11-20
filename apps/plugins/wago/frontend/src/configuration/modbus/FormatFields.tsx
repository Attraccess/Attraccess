import { Description } from '@heroui/react';
import type { RegisterFormat } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { Choice } from './Choice';
import { Field } from './Field';

export function FormatFields({
  value,
  onChange,
}: {
  value: RegisterFormat;
  onChange: (value: RegisterFormat) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
      {(['address', 'scale', 'offset'] as const).map((key) => (
        <Field
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          numeric
          onChange={(v) => onChange({ ...value, [key]: Number(v) })}
        />
      ))}
      <Choice
        label={t('modbus.addressConvention')}
        value={value.addressBase}
        options={[0, 1]}
        onChange={(v) => onChange({ ...value, addressBase: Number(v) as 0 | 1 })}
      />
      <Choice
        label={t('modbus.dataType')}
        value={value.dataType}
        options={['uint16', 'int16', 'uint32', 'int32', 'float32']}
        onChange={(v) => onChange({ ...value, dataType: v as RegisterFormat['dataType'] })}
      />
      {(['byteOrder', 'wordOrder'] as const).map((key) => (
        <Choice
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          options={['big', 'little']}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <Description>{t('modbus.formatHint')}</Description>
    </div>
  );
}
