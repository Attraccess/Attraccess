// Shared CSV export drawer content — column picker, preview table, download footer
// FEATURE: CSV export — drawer body and footer used by every export type
import { Button, DrawerBody, DrawerFooter } from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
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
  onFetchAllPages?: () => void;
  isFetchingAllPages?: boolean;
}

interface ItemRow {
  key: string;
  columns: Array<{ key: string; value: string }>;
}

export function CsvExportDrawerContent<TData extends Row>(props: Props<TData>) {
  const { columns, items, refetch, options, setOption, filename, queryStatus, onFetchAllPages, isFetchingAllPages } =
    props;

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
    const csv = [headerRow.join(';'), ...itemRows.map((row) => row.columns.map((col) => col.value).join(';'))].join(
      '\n',
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
  }, [selectedColumns, itemRows, filename]);

  const [pendingDownload, setPendingDownload] = useState(false);

  // When all pages finish loading after user triggered export, auto-download
  useEffect(() => {
    if (pendingDownload && queryStatus === 'error') {
      setPendingDownload(false);
    } else if (pendingDownload && !isFetchingAllPages && queryStatus === 'success') {
      setPendingDownload(false);
      downloadCsv();
    }
  }, [pendingDownload, isFetchingAllPages, queryStatus, downloadCsv]);

  const handleExport = useCallback(() => {
    if (onFetchAllPages) {
      setPendingDownload(true);
      onFetchAllPages();
    } else {
      downloadCsv();
    }
  }, [onFetchAllPages, downloadCsv]);

  const isExporting = pendingDownload || !!isFetchingAllPages;
  const cannotExport = queryStatus !== 'success';

  const columnsLite = useMemo(() => columns.map((c) => ({ key: c.key, label: c.label })), [columns]);

  return (
    <>
      <DrawerBody className="flex w-full flex-col gap-6">
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
      </DrawerBody>
      <DrawerFooter className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button slot="close" variant="outline" className="w-full sm:w-auto" data-cy="csv-export-drawer-cancel-button">
          {t('actions.cancel')}
        </Button>
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          onPress={handleExport}
          isDisabled={selectedColumns.length === 0 || items.length === 0 || isExporting || cannotExport}
          isPending={isExporting}
          data-cy="resource-usage-export-download-csv-button"
        >
          <DownloadIcon className="size-4" />
          {t('actions.downloadCsv')}
        </Button>
      </DrawerFooter>
    </>
  );
}
