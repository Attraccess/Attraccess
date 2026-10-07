import { Label } from '@heroui/react';
import { ListBox } from '@heroui/react';
import { Select } from '@heroui/react';
import { useWagoTranslations } from './i18n';

import { Input } from '@heroui/react';
import { TextField } from '@heroui/react';
import { Button } from '@heroui/react';
import { pointLabel } from './configuration-model';
import type { ConfigurationEditorMetadata } from './api';
import type { WagoConfigurationSnapshot } from './api';
import { ModbusPointForm } from './ModbusConfigurationForm';
import { bindModbusPoint } from './modbus-editor';
import { emptyModbus } from './modbus-editor';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <Select
      value={value || null}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      placeholder={t('channels.select')}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  integer = true,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  return (
    <TextField isRequired>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={integer ? 1 : 'any'}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      />
    </TextField>
  );
}

export function PhysicalAssignments({
  snapshot,
  metadata,
  onChange,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onChange: (snapshot: WagoConfigurationSnapshot) => void;
}) {
  const { t } = useWagoTranslations();
  const unused = snapshot.physicalPoints.filter(
    (point) =>
      (point.hardwareProfile === '751-9301' || point.hardwareProfile === 'modbus') &&
      !snapshot.logicalChannels.some((channel) => channel.physicalPointId === point.id),
  );
  if (!unused.length) return null;
  return (
    <section aria-label={t('channels.unusedAssignments')} className="wg:min-w-0">
      <h3>{t('channels.unusedAssignments')}</h3>
      {unused.map((point) => (
        <fieldset key={point.id} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-3">
          <legend className="wg:max-w-full wg:whitespace-normal wg:break-words">
            {pointLabel(point, metadata.names, t)}
          </legend>
          {point.hardwareProfile === 'modbus' && (
            <ModbusPointForm
              configuration={snapshot.modbus ?? emptyModbus}
              value={point.modbus ?? { deviceId: '' }}
              onChange={(binding) => onChange(bindModbusPoint(snapshot, point.id, binding))}
            />
          )}
          <Button
            className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
            variant="secondary"
            onPress={() =>
              onChange({ ...snapshot, physicalPoints: snapshot.physicalPoints.filter((item) => item.id !== point.id) })
            }
          >
            {t('channels.release', { point: pointLabel(point, metadata.names, t) })}
          </Button>
        </fieldset>
      ))}
    </section>
  );
}
