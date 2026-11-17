import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { type CsvRowError, getCsvRowErrorFieldKey, getCsvRowErrorReasonKey } from './csvRowErrors';
import en from './en.json';
import de from './de.json';

/** The rows the server rejected, with translated fields and reasons where the API sends a known code. */
export function CsvRowErrorsTable({ rowErrors }: Readonly<{ rowErrors: CsvRowError[] }>) {
  const { t } = useTranslations({ en, de });

  const translateErrorField = (error: CsvRowError) => {
    if (!error.field) return '-';
    const fieldKey = getCsvRowErrorFieldKey(error);
    return fieldKey ? t(fieldKey) : error.field;
  };

  const translateErrorReason = (error: CsvRowError) => {
    const reasonKey = getCsvRowErrorReasonKey(error);
    return reasonKey ? t(reasonKey) : error.message;
  };

  return (
    <div className="flex flex-col gap-2 border border-default-200 rounded-medium p-3">
      <Badge.Anchor>
        <h3 className="text-sm font-semibold">{t('errors.title')}</h3>
        <Badge color="danger" variant="soft">
          {rowErrors.length}
        </Badge>
      </Badge.Anchor>

      <Table>
        <TableScrollContainer>
          <TableContent aria-label="csv-invite-errors">
            <TableHeader>
              <TableColumn isRowHeader>{t('errors.columns.row')}</TableColumn>
              <TableColumn>{t('errors.columns.field')}</TableColumn>
              <TableColumn>{t('errors.columns.message')}</TableColumn>
              <TableColumn>{t('errors.columns.value')}</TableColumn>
            </TableHeader>
            <TableBody items={rowErrors}>
              {(error) => (
                <TableRow key={`${error.row}-${error.field ?? 'general'}`}>
                  <TableCell>#{error.row}</TableCell>
                  <TableCell>{translateErrorField(error)}</TableCell>
                  <TableCell>{translateErrorReason(error)}</TableCell>
                  <TableCell>{error.value ?? '-'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </div>
  );
}
