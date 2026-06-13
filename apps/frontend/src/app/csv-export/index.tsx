// CSV export page composition — date range picker and export type cards
// FEATURE: CSV export — top level page for /csv-export route
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DateValue, RangeValue } from '@heroui/react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateRangeSection } from './date-range-section';
import { computeRange, Preset, rangeToDateBounds } from './date-range-section/compute-range';
import { ExportTypeKey, ExportTypeSection } from './export-type-section';
import de from './de.json';
import en from './en.json';

const DEFAULT_PRESET: Preset = 'last30d';

export function CsvExport() {
  const { t } = useTranslations({ de, en });
  const navigate = useNavigate();

  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<RangeValue<DateValue> | null>(computeRange(DEFAULT_PRESET));
  const now = useRef(new Date());

  const openExport = useCallback((key: ExportTypeKey) => {
    const { start, end } = rangeToDateBounds(dateRange, now.current);
    const path = key === 'resourceUsageHours' ? '/csv-export/resource-usage-hours' : '/csv-export/billing-transactions';
    const search = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });

    navigate(`${path}?${search.toString()}`);
  }, [dateRange, navigate]);

  const handleRangeChange = useCallback(
    (next: RangeValue<DateValue>) => {
      setDateRange(next);
      if (preset !== 'custom') setPreset('custom');
    },
    [preset],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle')}</p>
      </header>

      <DateRangeSection
        preset={preset}
        range={dateRange}
        onPresetChange={setPreset}
        onRangeChange={handleRangeChange}
        t={t}
      />

      <ExportTypeSection range={dateRange} onOpen={openExport} t={t} />
    </div>
  );
}
