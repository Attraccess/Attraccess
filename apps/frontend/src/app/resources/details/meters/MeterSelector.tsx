import { Label, ListBox, Select } from '@heroui/react';
import { useResourceMeteringServiceListResourceMeters } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { MeterNameEditor } from './MeterNameEditor';
import en from './en.json';
import de from './de.json';

export function MeterSelector({
  resourceId,
  value,
  onChange,
}: {
  resourceId: number;
  value?: number;
  onChange: (id: number) => void;
}) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const { data: meters = [], isError } = useResourceMeteringServiceListResourceMeters({ resourceId });
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value ?? null}
        onChange={(id) => {
          if (id != null) onChange(Number(id));
        }}
        isRequired
        placeholder={t('choose')}
      >
        <Label>{t('meter')}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {meters.map((meter) => (
              <ListBox.Item key={meter.id} id={meter.id} textValue={meter.name}>
                {meter.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {isError && <p role="alert">{t('loadError')}</p>}
      {hasPermission('resources.update') && (
        <MeterNameEditor resourceId={resourceId} onSaved={(meter) => onChange(meter.id)} />
      )}
    </div>
  );
}
