import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import { ArrowLeftIcon } from 'lucide-react';
import { ReactNode, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { computeRange, rangeToDateBounds } from './date-range-section/compute-range';
import { ResourceUsageExport } from './resource-usage';
import { BillingTransactionsExport } from './billing-transactions';
import de from './de.json';
import en from './en.json';

interface Props {
  exportKey: 'resourceUsageHours' | 'billingTransactions';
  children: (props: { start: Date; end: Date; onCancel: () => void }) => ReactNode;
}

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function CsvExportConfigurePage(props: Props) {
  const { exportKey, children } = props;
  const { t } = useTranslations({ de, en });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const formatDate = useDateTimeFormatter({ showDate: true });

  const defaultBounds = useMemo(() => rangeToDateBounds(computeRange('last30d'), new Date()), []);
  const start = parseDateParam(searchParams.get('start'), defaultBounds.start);
  const end = parseDateParam(searchParams.get('end'), defaultBounds.end);
  const closePage = () => navigate('/csv-export');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8" data-cy="csv-export-config-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Button variant="ghost" className="w-fit" onPress={closePage} data-cy="csv-export-config-back-button">
            <ArrowLeftIcon className="size-4" />
            {t('actions.back')}
          </Button>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{t(`exports.${exportKey}.title`)}</h1>
            <p className="text-sm text-muted">
              {t('exports.modal.subtitle', { start: formatDate(start), end: formatDate(end) })}
            </p>
          </div>
        </div>
      </header>

      {children({ start, end, onCancel: closePage })}
    </div>
  );
}

export function ResourceUsageCsvExportPage() {
  return (
    <CsvExportConfigurePage exportKey="resourceUsageHours">
      {({ start, end, onCancel }) => <ResourceUsageExport start={start} end={end} onCancel={onCancel} />}
    </CsvExportConfigurePage>
  );
}

export function BillingTransactionsCsvExportPage() {
  return (
    <CsvExportConfigurePage exportKey="billingTransactions">
      {({ start, end, onCancel }) => <BillingTransactionsExport start={start} end={end} onCancel={onCancel} />}
    </CsvExportConfigurePage>
  );
}
