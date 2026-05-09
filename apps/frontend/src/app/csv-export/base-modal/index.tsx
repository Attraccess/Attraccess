import { ListboxWrapper, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Checkbox,
  Listbox,
  ListboxItem,
  ModalBody,
  ModalFooter,
  TableBody,
  TableHeader,
  TableRow,
  Table,
  TableColumn,
  TableCell,
} from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { EmptyState } from '../../../components/emptyState';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { RotateCwIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import de from './de.json';
import en from './en.json';

export interface ColumnDefinition<TData extends Row> {
  label: string;
  key: string;
  getter: (item: TData) => string;
  selectedByDefault?: boolean;
}

export interface OptionDefinition {
  label: string;
  key: string;
  value: boolean;
}

export type Row = {
  id: string | number;
  [key: string]: unknown;
};

interface Props<TData extends Row> {
  columns: ColumnDefinition<TData>[];
  items: TData[];
  refetch?: () => unknown;
  options?: OptionDefinition[];
  setOption?: (key: string, nextValue: boolean) => void;
  filename: string;
  queryStatus: QueryStatus;
}

interface ItemRow {
  key: string;
  columns: Array<{
    key: string;
    value: string;
  }>;
}

export function BaseCsvExportModal<TData extends Row>(props: Props<TData>) {
  const { columns, items, refetch, options, setOption, filename, queryStatus } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Array<string>>(
    columns.filter((col) => col.selectedByDefault).map((col) => col.key),
  );

  useEffect(() => {
    setSelectedColumnKeys(columns.filter((col) => col.selectedByDefault).map((col) => col.key));
  }, [columns]);

  const selectedColumns = useMemo(() => {
    return columns.filter((col) => selectedColumnKeys.includes(col.key));
  }, [columns, selectedColumnKeys]);

  const itemRows = useMemo(() => {
    const rows: ItemRow[] = [];

    items.forEach((item) => {
      const row: ItemRow = {
        key: String(item.id),
        columns: [],
      };
      selectedColumns.forEach((columnDefinition) => {
        const value = columnDefinition.getter(item);
        const column: ItemRow['columns'][0] = {
          key: columnDefinition.key,
          value: String(value ?? ''),
        };
        row.columns.push(column);
      });

      rows.push(row);
    });

    return rows;
  }, [items, selectedColumns]);

  const downloadCsv = useCallback(() => {
    const headerRow = selectedColumns.map((column) => column.label);

    const csv = [headerRow.join(';'), ...itemRows.map((row) => row.columns.map((col) => col.value).join(';'))].join(
      '\n',
    );

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    if (!filename.endsWith('.csv')) {
      a.download += '.csv';
    }
    a.click();
  }, [selectedColumns, itemRows, filename]);

  return (
    <>
      <ModalBody>
        <label className="text-sm font-medium">{t('inputs.columns.label')}</label>
        <ListboxWrapper>
          <Listbox
            classNames={{
              list: 'max-h-[200px] overflow-scroll',
            }}
            selectedKeys={selectedColumnKeys}
            items={columns}
            label={t('inputs.columns.label')}
            selectionMode="multiple"
            variant="soft"
            onSelectionChange={(keys) => {
              setSelectedColumnKeys(Array.from(keys as Set<string>));
            }}
            data-cy="resource-usage-export-columns-listbox"
          >
            {(column) => (
              <ListboxItem key={column.key} textValue={column.label}>
                {column.label}
              </ListboxItem>
            )}
          </Listbox>
        </ListboxWrapper>

        <div className="flex gap-4">
          {refetch && (
            <Button variant="secondary"
              onPress={() => refetch()}
              data-cy="resource-usage-export-refresh-button"
            >
              {t('actions.refetch')}
            <RotateCwIcon className={'w-4 h-4 ' + (queryStatus === 'pending' ? 'animate-spin' : '')} /></Button>
          )}

          {(options ?? []).map((option) => (
            <Checkbox
              key={option.key}
              isSelected={option.value}
              onValueChange={(nextValue) => setOption?.(option.key, nextValue)}
              data-cy="resource-usage-export-grouping-checkbox"
            >
              {option.label}
            </Checkbox>
          ))}
        </div>

        <Table

          isVirtualized
          maxTableHeight={500}
          rowHeight={40}
          data-cy="resource-usage-export-table"
          aria-label={t('table.ariaLabel')}
        >
          <TableHeader columns={selectedColumns}>
            {(column) => <TableColumn key={column.key} id={column.key}>{column.label}</TableColumn>}
          </TableHeader>
          <TableBody
            items={itemRows}
            renderEmptyState={() => <EmptyState />}
          >
            {(row) => (
              <TableRow key={row.key} id={row.key}>
                {row.columns.map((column) => (
                  <TableCell style={{ whiteSpace: 'nowrap' }} key={column.key}>
                    {column.value}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button onPress={() => downloadCsv()} data-cy="resource-usage-export-download-csv-button">
          {t('actions.downloadCsv')}
        </Button>
      </ModalFooter>
    </>
  );
}
