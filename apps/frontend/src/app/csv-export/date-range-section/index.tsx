// Date range section for CSV export — preset chips, calendar, summary pill
// FEATURE: CSV export — step 1 of new export flow
import { Card, DateValue, RangeCalendar, RangeValue } from '@heroui/react';
import { CalendarRangeIcon } from 'lucide-react';
import { PresetChips } from './preset-chips';
import { SelectedRangePill } from './selected-range-pill';
import { computeRange, Preset } from './compute-range';

interface Props {
  preset: Preset;
  range: RangeValue<DateValue> | null;
  onPresetChange: (preset: Preset) => void;
  onRangeChange: (range: RangeValue<DateValue>) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function DateRangeSection(props: Props) {
  const { preset, range, onPresetChange, onRangeChange, t } = props;

  const handlePreset = (next: Preset) => {
    onPresetChange(next);
    if (next !== 'custom') {
      const computed = computeRange(next);
      if (computed) onRangeChange(computed);
    }
  };

  return (
    <Card>
      <Card.Header className="flex flex-col gap-1">
        <Card.Title className="flex items-center gap-2 text-base">
          <span className="flex items-center justify-center size-7 rounded-full bg-accent-100 text-accent-700 text-xs font-semibold">
            1
          </span>
          <CalendarRangeIcon className="size-4 text-muted-foreground" />
          {t('steps.range.title')}
        </Card.Title>
        <Card.Description>{t('steps.range.description')}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PresetChips value={preset} onChange={handlePreset} t={t} />
          <SelectedRangePill
            range={range}
            emptyLabel={t('range.empty')}
            summaryLabel={({ start, end, days }) => t('range.summary', { start, end, days })}
          />
        </div>

        {preset === 'custom' && (
          <div className="border-t border-default-100 pt-4">
            <RangeCalendar
              value={range ?? null}
              onChange={(value) => onRangeChange(value)}
              id="date-range"
              aria-label={t('rangeCalendar.label')}
              data-cy="csv-export-range-calendar"
            >
              <RangeCalendar.Header>
                <RangeCalendar.Heading />
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
