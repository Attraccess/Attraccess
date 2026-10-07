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
import { toExactCredits } from '@attraccess/shared';
import { useTransactionDetailsModalState } from './useTransactionDetailsModalState';
type Props = Pick<
  ReturnType<typeof useTransactionDetailsModalState>,
  't' | 'transaction' | 'formatMeterValue' | 'tExists' | 'formatCredits' | 'totalItemsAmount'
>;
export function TransactionDetailsModalItemsTitle({
  t,
  transaction,
  formatMeterValue,
  tExists,
  formatCredits,
  totalItemsAmount,
}: Props) {
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
              {(transaction.items ?? []).map((item) => {
                const isMeter = item.meterCreditsPerUnit != null || item.meterQuantity != null;
                const value =
                  item.meterQuantity == null ? t('items.unavailable') : formatMeterValue(item.meterQuantity);
                return (
                  <TableRow key={item.id} id={item.id}>
                    <TableCell className="min-w-0 whitespace-normal wrap-anywhere">
                      <div className="font-medium">
                        {!isMeter && tExists('items.system.' + item.name) ? t('items.system.' + item.name) : item.name}
                      </div>
                      <div className="text-tiny text-default-500 sm:hidden">
                        {isMeter && item.meterQuantity == null
                          ? t('items.meterUnavailable', {
                              rate: formatCredits(item.meterCreditsPerUnit ?? 0),
                            })
                          : item.description}
                      </div>
                      {item.externalReference && !isMeter && (
                        <div className="text-tiny text-default-400">{item.externalReference}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden min-w-0 whitespace-normal wrap-anywhere sm:table-cell">
                      {isMeter
                        ? t(item.meterQuantity == null ? 'items.meterUnavailable' : 'items.meterDescription', {
                            value,
                            rate: formatCredits(item.meterCreditsPerUnit ?? 0),
                          })
                        : item.description}
                    </TableCell>
                    <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                      {isMeter ? value : item.quantity}
                    </TableCell>
                    <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                      {isMeter ? formatCredits(item.meterCreditsPerUnit ?? 0) : formatCredits(item.unitPrice)}
                    </TableCell>
                    <TableCell className="min-w-0 px-2 text-right whitespace-normal wrap-anywhere">
                      {formatCredits(toExactCredits(item.unitPrice) * toExactCredits(item.quantity))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <div className="mt-2 flex justify-end text-small text-default-500">
        <div>
          {t('items.total')}: <span className="font-semibold text-foreground">{formatCredits(totalItemsAmount)}</span>
        </div>
      </div>
    </div>
  );
}
