import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TableRow,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { formatDurationMs, toExactCredits } from '@attraccess/shared';
import { BillingTransaction } from '@attraccess/react-query-client';
import { useMemo } from 'react';
import {
  AllocationBreakdown,
  AllocationShareSummary,
  getItemAllocation,
} from '../../../../../components/allocationBreakdown';
import { useMeterValueFormatter } from '../../../../../hooks/useMeterValueFormatter';
import { useCreditsFormatter } from '../../../../../hooks/useCreditsFormatter';
import de from './de.json';
import en from './en.json';

interface TransactionItemsTableProps {
  transaction: BillingTransaction;
  /** The billing currency's minor unit, from the configuration the details modal already loaded. */
  minorUnit: number;
}

/** The line items of a transaction with totals and the allocation breakdown of shared meters. */
export function TransactionItemsTable({ transaction, minorUnit }: Readonly<TransactionItemsTableProps>) {
  const { t, tExists } = useTranslations({ en, de });
  const formatMeterValue = useMeterValueFormatter();
  const formatCredits = useCreditsFormatter(minorUnit);

  const totalItemsAmount = useMemo(() => {
    if (!transaction.items) return BigInt(0);
    const items = Array.isArray(transaction.items) ? transaction.items : [transaction.items];
    return items.reduce((sum, item) => sum + toExactCredits(item.unitPrice) * toExactCredits(item.quantity), BigInt(0));
  }, [transaction]);

  const items = (transaction.items ?? []).map((item) => {
    const isMeter = item.meterCreditsPerUnit != null || item.meterQuantity != null;
    const allocation = getItemAllocation(item);
    // A pending share has no segments yet: it is charged later, so nothing is shown as shared.
    const shared = allocation && !allocation.pending ? allocation : null;
    const rate = formatCredits(item.meterCreditsPerUnit ?? 0);
    return {
      item,
      isMeter,
      allocation,
      shared,
      label: !isMeter && tExists('items.system.' + item.name) ? t('items.system.' + item.name) : item.name,
      value: allocation?.pending
        ? t('items.pending')
        : item.meterQuantity == null
          ? t('items.unavailable')
          : formatMeterValue(item.meterQuantity),
      notice: !isMeter
        ? null
        : allocation?.pending
          ? t('items.meterPending', { rate })
          : item.meterQuantity == null
            ? t('items.meterUnavailable', { rate })
            : null,
      rate,
    };
  });
  return (
    <div>
      <div className="mb-2 font-semibold">{t('items.title')}</div>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label="Transaction items" className="w-full table-fixed">
            <TableHeader>
              <TableColumn isRowHeader className="w-[40%] sm:w-[22%]">
                {t('items.columns.name')}
              </TableColumn>
              <TableColumn className="hidden w-[28%] sm:table-cell">{t('items.columns.description')}</TableColumn>
              <TableColumn className="w-[25%] sm:w-[20%]">{t('items.columns.quantity')}</TableColumn>
              <TableColumn className="w-[17.5%] px-2 whitespace-normal wrap-anywhere sm:w-[15%]">
                <span className="sm:hidden">{t('items.columns.rateShort')}</span>
                <span className="hidden sm:inline">{t('items.columns.unitPrice')}</span>
              </TableColumn>
              <TableColumn className="w-[17.5%] px-2 whitespace-normal wrap-anywhere sm:w-[15%]">
                <span className="sm:hidden">{t('items.columns.totalShort')}</span>
                <span className="hidden sm:inline">{t('items.columns.subtotal')}</span>
              </TableColumn>
            </TableHeader>
            <TableBody renderEmptyState={() => t('items.empty')}>
              {items.map(({ item, isMeter, shared, label, value, notice, rate }) => (
                <TableRow key={item.id} id={item.id}>
                  <TableCell className="min-w-0 whitespace-normal wrap-anywhere">
                    <div className="font-medium">{label}</div>
                    <div className="text-tiny text-default-500 sm:hidden">{notice ?? item.description}</div>
                    {item.externalReference && !isMeter && (
                      <div className="text-tiny text-default-400">{item.externalReference}</div>
                    )}
                    {shared && (
                      <AllocationShareSummary
                        allocation={shared}
                        formatMeterValue={formatMeterValue}
                        shareValue={
                          shared.kind === 'operating-time' ? String(item.durationMs ?? '') || null : item.meterQuantity
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="hidden min-w-0 whitespace-normal wrap-anywhere sm:table-cell">
                    {notice ??
                      (!isMeter
                        ? item.description
                        : shared
                          ? t('items.meterSharedDescription', { rate })
                          : t('items.meterDescription', { value, rate }))}
                  </TableCell>
                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                    {isMeter
                      ? value
                      : shared?.kind === 'operating-time' && item.durationMs != null
                        ? formatDurationMs(item.durationMs)
                        : item.quantity}
                  </TableCell>
                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                    {/* A shared running-time charge is a sum of rounded segment shares: it has no single rate. */}
                    {isMeter ? rate : shared?.kind === 'operating-time' ? '—' : formatCredits(item.unitPrice)}
                  </TableCell>
                  <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                    {formatCredits(toExactCredits(item.unitPrice) * toExactCredits(item.quantity))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <div className="mt-2 flex justify-end text-small text-default-500">
        <div>
          {t('items.total')}: <span className="font-semibold text-foreground">{formatCredits(totalItemsAmount)}</span>
        </div>
      </div>
      <AllocationBreakdown
        entries={items.flatMap(({ item, shared, label }) =>
          shared ? [{ id: item.id, name: label, allocation: shared }] : [],
        )}
        formatMeterValue={formatMeterValue}
        formatCredits={formatCredits}
      />
    </div>
  );
}
