// Export type section for CSV export — clickable cards per export type
// FEATURE: CSV export — step 2 of new export flow
import { Card, DateValue, RangeValue } from '@heroui/react';
import { FileSpreadsheetIcon } from 'lucide-react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { ResourceUsageCard } from './resource-usage-card';
import { BillingTransactionsCard } from './billing-transactions-card';
import { useAuth } from '../../../hooks/useAuth';

export type ExportTypeKey = 'resourceUsageHours' | 'billingTransactions';

interface Props {
  range: RangeValue<DateValue> | null;
  onOpen: (key: ExportTypeKey) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function ExportTypeSection(props: Props) {
  const { range, onOpen, t } = props;
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { hasPermission } = useAuth();

  return (
    <Card>
      <Card.Header className="flex flex-col gap-1">
        <Card.Title className="flex items-center gap-2 text-base">
          <span className="flex items-center justify-center size-7 rounded-full bg-accent-soft text-accent-soft-foreground text-xs font-semibold">
            2
          </span>
          <FileSpreadsheetIcon className="size-4 text-muted" />
          {t('steps.type.title')}
        </Card.Title>
        <Card.Description>{t('steps.type.description')}</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hasPermission('resources.reports.export') && (
            <ResourceUsageCard range={range} onPress={() => onOpen('resourceUsageHours')} t={t} />
          )}
          {license?.modules.includes('billing') && hasPermission('billing.manage') && (
            <BillingTransactionsCard range={range} onPress={() => onOpen('billingTransactions')} t={t} />
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
