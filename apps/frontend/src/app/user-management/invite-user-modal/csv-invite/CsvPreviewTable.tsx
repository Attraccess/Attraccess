import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { EmptyState, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PREVIEW_ROW_COUNT } from './useCsvPreview';
import en from './en.json';
import de from './de.json';

interface CsvPreviewTableProps {
  csvHeaders: string[];
  previewRows: string[][];
  usernameKey?: string;
  emailKey?: string;
}

/** The first rows of the CSV as they would be invited with the current column mapping. */
export function CsvPreviewTable({ csvHeaders, previewRows, usernameKey, emailKey }: Readonly<CsvPreviewTableProps>) {
  const { t } = useTranslations({ en, de });

  const previewUsers = useMemo(() => {
    if (!csvHeaders.length && !previewRows.length) return [];

    return previewRows.slice(0, PREVIEW_ROW_COUNT).map((columns, index) => {
      const data: Record<string, string> = {};

      csvHeaders.forEach((header, headerIndex) => {
        const column = columns[headerIndex] ?? '';
        data[header] = column;
      });

      return {
        index: index + 1,
        username: data[usernameKey ?? ''] ?? '',
        email: data[emailKey ?? ''] ?? '',
      };
    });
  }, [csvHeaders, previewRows, usernameKey, emailKey]);

  return (
    <Table data-cy="csv-invite-table">
      <TableScrollContainer>
        <TableContent aria-label="csv-invite-table">
          <TableHeader>
            <TableColumn isRowHeader>{t('preview.columns.index')}</TableColumn>
            <TableColumn>{t('preview.columns.username')}</TableColumn>
            <TableColumn>{t('preview.columns.email')}</TableColumn>
          </TableHeader>
          <TableBody items={previewUsers} renderEmptyState={() => <EmptyState />}>
            {(user) => (
              <TableRow key={user.index} id={user.index}>
                <TableCell>#{user.index}</TableCell>
                <TableCell className="w-full">{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
