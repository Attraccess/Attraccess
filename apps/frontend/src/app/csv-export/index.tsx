// CSV export landing page — date range picker and export type cards
// FEATURE: CSV export — top level page for /csv-export route; each card opens its dedicated configuration page
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DateValue, RangeValue } from '@heroui/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateRangeSection } from './date-range-section';
import { computeRange, Preset, rangeToDateBounds } from './date-range-section/compute-range';
import { ExportTypeSection } from './export-type-section';
import {
  boundsToRange,
  boundsToSearch,
  EXPORT_PATHS,
  ExportTypeKey,
  parseRangeSearchParams,
} from './range-search-params';
import de from './de.json';
import en from './en.json';

const DEFAULT_PRESET: Preset = 'last30d';

export type { ExportTypeKey };

export function CsvExport() {
  const { t } = useTranslations({ de, en });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Coming back from a configuration page keeps the range that was in its URL.
  const initial = useMemo(() => parseRangeSearchParams(searchParams), [searchParams]);
  const [preset, setPreset] = useState<Preset>(initial.isFallback ? DEFAULT_PRESET : 'custom');
  const [dateRange, setDateRange] = useState<RangeValue<DateValue> | null>(
    initial.isFallback ? computeRange(DEFAULT_PRESET) : boundsToRange(initial),
  );

  const handleRangeChange = useCallback(
    (next: RangeValue<DateValue>) => {
      setDateRange(next);
      if (preset !== 'custom') setPreset('custom');
    },
    [preset],
  );

  const now = useRef(new Date());

  const openExport = useCallback(
    (key: ExportTypeKey) => {
      const bounds = rangeToDateBounds(dateRange, now.current);
      navigate(`${EXPORT_PATHS[key]}?${boundsToSearch(bounds)}`);
    },
    [dateRange, navigate],
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
