import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, DateField, FieldError, Label } from '@heroui/react';
import {
  CalendarDate,
  CalendarDateTime,
  GregorianCalendar,
  parseDate,
  parseDateTime,
  toCalendar,
} from '@internationalized/date';
import { DateTimeLocaleProvider } from './dateTimeLocaleProvider';

interface Props {
  label: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  isDisabled?: boolean;
}

/** Values stay Gregorian and locale-independent; callers own timezone conversion. */
export function LocaleDateField({ label, clearLabel, value, onChange, withTime, isDisabled }: Props) {
  const [clearCount, setClearCount] = useState(0);
  let parsed: CalendarDate | CalendarDateTime | null = null;
  try {
    if (value) parsed = withTime ? parseDateTime(value) : parseDate(value);
  } catch {
    /* Preserve invalid values for the caller's validation. */
  }
  return (
    <DateTimeLocaleProvider>
      <DateField
        key={clearCount}
        value={parsed}
        onChange={(date) => onChange(date ? toCalendar(date, new GregorianCalendar()).toString() : '')}
        granularity={withTime ? 'minute' : 'day'}
        isDisabled={isDisabled}
        isInvalid={!!value && !parsed}
      >
        <Label>{label}</Label>
        <DateField.Group>
          <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <Button
              variant="ghost"
              isIconOnly
              aria-label={clearLabel}
              isDisabled={isDisabled}
              onPress={() => {
                onChange('');
                setClearCount((count) => count + 1);
              }}
            >
              <X size={16} />
            </Button>
          </DateField.Suffix>
        </DateField.Group>
        <FieldError />
      </DateField>
    </DateTimeLocaleProvider>
  );
}
