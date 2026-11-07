import { Button } from '@attraccess/plugins-frontend-ui';
import { Input, Label, TextField } from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useReservationsTranslations } from '../i18n';
import type { BookableHours, Weekday } from '../lib/time';
import { MAX_RANGES_PER_DAY } from '../lib/validation';

const DISPLAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface Props {
  value: BookableHours;
  onChange: (value: BookableHours) => void;
  errors: Record<string, string>;
}

/** Per weekday time ranges; no range anywhere means the resource is bookable around the clock. */
export function BookableHoursEditor({ value, onChange, errors }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const setDay = (day: Weekday, ranges: { start: string; end: string }[]) => onChange({ ...value, [day]: ranges });

  return (
    <div className="rv:flex rv:min-w-0 rv:flex-col rv:gap-3" data-cy="reservations-bookable-hours">
      <p className="rv:text-sm rv:text-muted">{t('settings.hours.description')}</p>
      {DISPLAY_ORDER.map((day) => {
        const ranges = value[day] ?? [];
        const error = errors[`bookableHours.${day}`];
        return (
          <div key={day} className="rv:flex rv:flex-col rv:gap-2">
            <div className="rv:flex rv:flex-wrap rv:items-center rv:gap-2">
              <span className="rv:w-28 rv:text-sm rv:font-medium">{t(`weekdays.${day}`)}</span>
              {ranges.length === 0 && <span className="rv:text-sm rv:text-muted">{t('settings.hours.allDay')}</span>}
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={ranges.length >= MAX_RANGES_PER_DAY}
                onPress={() => setDay(day, [...ranges, { start: '09:00', end: '17:00' }])}
                data-cy={`reservations-hours-add-${day}`}
              >
                <PlusIcon size={14} /> {t('settings.hours.addRange')}
              </Button>
            </div>
            {ranges.map((range, index) => (
              <div key={`${day}-${index}`} className="rv:flex rv:items-end rv:gap-2 rv:pl-2">
                <TextField
                  value={range.start}
                  onChange={(start) =>
                    setDay(
                      day,
                      ranges.map((r, i) => (i === index ? { ...r, start } : r)),
                    )
                  }
                  isInvalid={Boolean(error)}
                  className="rv:min-w-0 rv:flex-1"
                >
                  <Label>{t('settings.hours.from')}</Label>
                  <Input placeholder="09:00" maxLength={5} fullWidth />
                </TextField>
                <TextField
                  value={range.end}
                  onChange={(end) =>
                    setDay(
                      day,
                      ranges.map((r, i) => (i === index ? { ...r, end } : r)),
                    )
                  }
                  isInvalid={Boolean(error)}
                  className="rv:min-w-0 rv:flex-1"
                >
                  <Label>{t('settings.hours.to')}</Label>
                  <Input placeholder="17:00" maxLength={5} fullWidth />
                </TextField>
                <Button
                  isIconOnly
                  variant="ghost"
                  className="rv:shrink-0"
                  aria-label={t('settings.hours.removeRange')}
                  onPress={() =>
                    setDay(
                      day,
                      ranges.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2Icon size={16} />
                </Button>
              </div>
            ))}
            {error && <p className="rv:pl-2 rv:text-sm rv:text-danger">{t(`settings.validation.${error}`)}</p>}
          </div>
        );
      })}
    </div>
  );
}
