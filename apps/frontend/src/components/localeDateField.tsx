import { useEffect, useMemo, useState } from 'react';
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
  onValidityChange?: (isValid: boolean) => void;
  errorMessage: string;
  withTime?: boolean;
  isDisabled?: boolean;
}

export function DateFieldValidity({
  incomplete,
  invalid,
  onIncompleteChange,
  onValidityChange,
}: {
  incomplete: boolean;
  invalid: boolean;
  onIncompleteChange: (incomplete: boolean) => void;
  onValidityChange?: (isValid: boolean) => void;
}) {
  useEffect(() => {
    onIncompleteChange(incomplete);
    onValidityChange?.(!incomplete && !invalid);
  }, [incomplete, invalid, onIncompleteChange, onValidityChange]);
  return null;
}

/** Values stay Gregorian and locale-independent; callers own timezone conversion. */
export function LocaleDateField({
  label,
  clearLabel,
  value,
  onChange,
  onValidityChange,
  errorMessage,
  withTime,
  isDisabled,
}: Props) {
  const [clearCount, setClearCount] = useState(0);
  const [incomplete, setIncomplete] = useState(false);
  // React Aria resets partial segments when the controlled value's identity changes.
  const parsed = useMemo<CalendarDate | CalendarDateTime | null>(() => {
    try {
      return value ? (withTime ? parseDateTime(value) : parseDate(value)) : null;
    } catch {
      /* Preserve invalid values for the caller's validation. */
      return null;
    }
  }, [value, withTime]);
  return (
    <DateTimeLocaleProvider>
      <DateField
        key={clearCount}
        value={parsed}
        onChange={(date) => onChange(date ? toCalendar(date, new GregorianCalendar()).toString() : '')}
        granularity={withTime ? 'minute' : 'day'}
        isDisabled={isDisabled}
        isInvalid={incomplete || (!!value && !parsed)}
        validationBehavior="aria"
      >
        {({ state }) => (
          <>
            {/* onChange retains the last complete date while segments are incomplete. */}
            <DateFieldValidity
              incomplete={
                state.segments.some((segment) => segment.isEditable && segment.isPlaceholder) &&
                (!!value || state.segments.some((segment) => segment.isEditable && !segment.isPlaceholder))
              }
              invalid={!!value && !parsed}
              onIncompleteChange={setIncomplete}
              onValidityChange={onValidityChange}
            />
            <Label>{label}</Label>
            <DateField.Group>
              <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
              <DateField.Suffix className="pointer-events-auto">
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
            <FieldError>{errorMessage}</FieldError>
          </>
        )}
      </DateField>
    </DateTimeLocaleProvider>
  );
}
