// CSV export page composition — date range picker, type cards, configure drawer
// FEATURE: CSV export — top level page for /csv-export route
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DateValue, DrawerHeader, RangeValue } from '@heroui/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StandardDrawer } from '../../components/standardDrawer';
import { DateRangeSection } from './date-range-section';
import { computeRange, Preset, rangeToDateBounds } from './date-range-section/compute-range';
import { SelectedRangePill } from './date-range-section/selected-range-pill';
import { ExportTypeKey, ExportTypeSection } from './export-type-section';
import { ResourceUsageExport } from './resource-usage';
import { BillingTransactionsExport } from './billing-transactions';
import de from './de.json';
import en from './en.json';

const DEFAULT_PRESET: Preset = 'last30d';

export function CsvExport() {
  const { t } = useTranslations({ de, en });

  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<RangeValue<DateValue> | null>(computeRange(DEFAULT_PRESET));
  const [activeExportKey, setActiveExportKey] = useState<ExportTypeKey | ''>('');
  const [showExport, setShowExport] = useState(false);

  const openExport = useCallback((key: ExportTypeKey) => {
    setActiveExportKey(key);
    setShowExport(true);
  }, []);

  const handleRangeChange = useCallback(
    (next: RangeValue<DateValue>) => {
      setDateRange(next);
      if (preset !== 'custom') setPreset('custom');
    },
    [preset],
  );

  const now = useRef(new Date());

  const ExportComponent = useMemo(() => {
    if (activeExportKey === 'resourceUsageHours') return ResourceUsageExport;
    if (activeExportKey === 'billingTransactions') return BillingTransactionsExport;
    return null;
  }, [activeExportKey]);

  const { start: startDate, end: endDate } = useMemo(
    () => rangeToDateBounds(dateRange, now.current),
    [dateRange],
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

      <StandardDrawer
        isOpen={showExport}
        onOpenChange={(open) => {
          if (!open) setShowExport(false);
        }}
      >
        <div data-cy="csv-export-modal" className="contents">
          <DrawerHeader className="flex w-full flex-col items-start gap-2">
            <h2 className="text-lg font-semibold">{activeExportKey && t(`exports.${activeExportKey}.title`)}</h2>
            <SelectedRangePill
              range={dateRange}
              emptyLabel={t('range.empty')}
              summaryLabel={({ start, end, days }) => t('range.summary', { start, end, days })}
              dataCy="csv-export-modal-range-pill"
            />
          </DrawerHeader>

          {ExportComponent && <ExportComponent start={startDate} end={endDate} />}
        </div>
      </StandardDrawer>
    </div>
  );
}
