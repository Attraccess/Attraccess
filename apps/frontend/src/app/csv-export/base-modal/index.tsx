// Modernized CSV export modal — two pane layout with column picker and preview
// FEATURE: CSV export — modal body and footer used by every export type
import { Button, ModalBody, ModalFooter } from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ColumnPicker } from './column-picker';
import { PreviewTable } from './preview-table';
import de from './de.json';
import en from './en.json';

const PREVIEW_LIMIT = 5;

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
  columns: Array<{ key: string; value: string }>;
}

export function BaseCsvExportModal<TData extends Row>(props: Props<TData>) {
  const { columns, items, refetch, options, setOption, filename, queryStatus } = props;

  const { t } = useTranslations({ de, en });

  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Array<string>>(
    columns.filter((col) => col.selectedByDefault).map((col) => col.key),
  );

  useEffect(() => {
    setSelectedColumnKeys(columns.filter((col) => col.selectedByDefault).map((col) => col.key));
  }, [columns]);

  const selectedColumns = useMemo(
    () => columns.filter((col) => selectedColumnKeys.includes(col.key)),
    [columns, selectedColumnKeys],
  );

  const itemRows: ItemRow[] = useMemo(() => {
    return items.map((item) => ({
      key: String(item.id),
      columns: selectedColumns.map((col) => ({
        key: col.key,
        value: String(col.getter(item) ?? ''),
      })),
    }));
  }, [items, selectedColumns]);

  const downloadCsv = useCallback(() => {
    const headerRow = selectedColumns.map((column) => column.label);
    const csv = [
      headerRow.join(';'),
      ...itemRows.map((row) => row.columns.map((col) => col.value).join(';')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
  }, [selectedColumns, itemRows, filename]);

  const columnsLite = useMemo(() => columns.map((c) => ({ key: c.key, label: c.label })), [columns]);

  return (
    <>
      <ModalBody className="grid grid-cols-1 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-6">
        <ColumnPicker
          columns={columnsLite}
          selectedKeys={selectedColumnKeys}
          onSelectionChange={setSelectedColumnKeys}
          options={options}
          onOptionChange={setOption}
          searchLabel={t('inputs.columns.label')}
          searchPlaceholder={t('inputs.columns.search')}
          selectAllLabel={t('inputs.columns.selectAll')}
          selectNoneLabel={t('inputs.columns.selectNone')}
          selectedCountLabel={(vars) => t('inputs.columns.selectedCount', vars)}
        />

        <PreviewTable
          columns={selectedColumns.map((c) => ({ key: c.key, label: c.label }))}
          rows={itemRows}
          totalCount={items.length}
          previewLimit={PREVIEW_LIMIT}
          ariaLabel={t('table.ariaLabel')}
          titleLabel={(vars) => t('preview.title', vars)}
          rowCountLabel={(vars) => t('preview.rowCount', vars)}
          refetch={refetch}
          queryStatus={queryStatus}
        />
      </ModalBody>
      <ModalFooter className="justify-end">
        <Button
          variant="primary"
          onPress={() => downloadCsv()}
          isDisabled={selectedColumns.length === 0 || items.length === 0}
          data-cy="resource-usage-export-download-csv-button"
        >
          {t('actions.downloadCsv')}
        </Button>
      </ModalFooter>
    </>
  );
}
