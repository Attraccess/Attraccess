import { ComboBox, Description, FieldError, Input, Label, ListBox } from '@heroui/react';
import { useMemo } from 'react';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  value: string | null;
  onChange: (timeZone: string | null) => void;
  isInvalid: boolean;
  isDisabled: boolean;
}

/** A searchable list of the IANA time zones the browser knows. */
export function TimeZoneField({ value, onChange, isInvalid, isDisabled }: Props) {
  const { t } = usePluginsTranslations();
  // `UTC` is missing from the browser's list, and a stored zone may be spelled differently than the browser does.
  const zones = useMemo(
    () =>
      [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(value ? [value] : [])])].map((zone) => ({
        id: zone,
      })),
    [value],
  );
  return (
    <ComboBox
      defaultItems={zones}
      selectedKey={value}
      onSelectionChange={(key) => onChange(key === null ? null : String(key))}
      isInvalid={isInvalid}
      isDisabled={isDisabled}
      isRequired
      data-cy="plugins-auto-updates-time-zone"
    >
      <Label>{t('autoUpdates.timeZone')}</Label>
      <ComboBox.InputGroup>
        <Input />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <Description>{t('autoUpdates.timeZoneHint')}</Description>
      {isInvalid ? <FieldError>{t('autoUpdates.timeZoneRequired')}</FieldError> : null}
      <ComboBox.Popover>
        <ListBox>
          {(zone: { id: string }) => (
            <ListBox.Item id={zone.id} textValue={zone.id}>
              {zone.id}
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
