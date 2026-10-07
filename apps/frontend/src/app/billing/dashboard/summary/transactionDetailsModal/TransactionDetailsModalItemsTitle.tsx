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
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { microWhToKwh } from './index.micro-wh-to-kwh';
import { useTransactionDetailsModalState } from './useTransactionDetailsModalState';
type Props = Pick<
  ReturnType<typeof useTransactionDetailsModalState>,
  't' | 'transaction' | 'tExists' | 'formatNumber' | 'configuration' | 'totalItemsAmount'
>;
export function TransactionDetailsModalItemsTitle({
  t,
  transaction,
  tExists,
  formatNumber,
  configuration,
  totalItemsAmount,
}: Props) {
  return (
    <div>
      <div className="mb-2 font-semibold">{t('items.title')}</div>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label="Transaction items">
            <TableHeader>
              <TableColumn isRowHeader>{t('items.columns.name')}</TableColumn>
              <TableColumn>{t('items.columns.description')}</TableColumn>
              <TableColumn>{t('items.columns.quantity')}</TableColumn>
              <TableColumn>{t('items.columns.unitPrice')}</TableColumn>
              <TableColumn>{t('items.columns.subtotal')}</TableColumn>
            </TableHeader>
            <TableBody renderEmptyState={() => t('items.empty')}>
              {(transaction.items ?? []).map((item) => (
                <TableRow key={item.id} id={item.id}>
                  <TableCell>
                    <div className="font-medium">
                      {tExists('items.system.' + item.name) ? t('items.system.' + item.name) : item.name}
                    </div>
                    {item.externalReference && (
                      <div className="text-tiny text-default-400">{item.externalReference}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[28ch] truncate">
                    {item.name === 'ENERGY' && item.energyMicroWh != null
                      ? t('items.energyDescription', {
                          kwh: formatNumber(microWhToKwh(item.energyMicroWh)),
                          rate: formatNumber(
                            dbCurrencyToUserCurrency(item.energyCreditsPerKwh ?? 0, configuration?.minorUnit ?? 2),
                          ),
                        })
                      : item.description}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.name === 'ENERGY' && item.energyMicroWh != null
                      ? formatNumber(microWhToKwh(item.energyMicroWh))
                      : item.quantity}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(
                      dbCurrencyToUserCurrency(
                        item.name === 'ENERGY' && item.energyCreditsPerKwh != null
                          ? item.energyCreditsPerKwh
                          : item.unitPrice,
                        configuration?.minorUnit ?? 2,
                      ),
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(
                      dbCurrencyToUserCurrency(item.unitPrice * item.quantity, configuration?.minorUnit ?? 2),
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <div className="mt-2 flex justify-end text-small text-default-500">
        <div>
          {t('items.total')}:{' '}
          <span className="font-semibold text-foreground">
            {formatNumber(dbCurrencyToUserCurrency(totalItemsAmount, configuration?.minorUnit ?? 2))}
          </span>
        </div>
      </div>
    </div>
  );
}
