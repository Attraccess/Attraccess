// Shared CSV export page content — template section, column editor, preview table, download button
// FEATURE: CSV export — rendered as normal page content for every export type
import { Button } from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { CsvExportType } from '@attraccess/react-query-client';
import { DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ColumnConfigList, OptionLite } from './column-config-list';
import { buildCsv, ConfiguredColumn, defaultColumns, FieldDefinition, resolveColumns } from './csv';
import { PreviewTable } from './preview-table';
import { TemplateSection } from './template-section';
import de from './de.json';
import en from './en.json';

const PREVIEW_LIMIT = 5;

export type ColumnDefinition<TData extends Row> = FieldDefinition<TData>;

export type OptionDefinition = OptionLite;

export type Row = {
  id: string | number;
  [key: string]: unknown;
};

interface Props<TData extends Row> {
  exportType: CsvExportType;
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

export function CsvExportConfigContent<TData extends Row>(props: Props<TData>) {
  const {
    exportType,
    columns: fields,
    items,
    refetch,
    options,
    setOption,
    filename,
    queryStatus,
    onFetchAllPages,
    isFetchingAllPages,
  } = props;

  const { t } = useTranslations({ de, en });

  // null = untouched: follow the export type's default columns (they only exist once the data fields do).
  // Fields appearing later (resource metadata keys, billing configuration) must never reset user edits.
  const [edited, setEdited] = useState<ConfiguredColumn[] | null>(null);
  const defaults = useMemo(() => defaultColumns(fields), [fields]);
  const configured = edited ?? defaults;
  const updateColumns = useCallback(
    (update: (columns: ConfiguredColumn[]) => ConfiguredColumn[]) => setEdited((current) => update(current ?? defaults)),
    [defaults],
  );

  const resolved = useMemo(() => resolveColumns(configured, fields), [configured, fields]);
  const fieldOptions = useMemo(() => fields.map(({ key, label }) => ({ key, label })), [fields]);

  const previewRows = useMemo(
    () =>
      items.slice(0, PREVIEW_LIMIT).map((item) => ({
        key: String(item.id),
        columns: resolved.map((column) => ({ key: column.uid, value: column.getValue(item) })),
      })),
    [items, resolved],
  );

  const downloadCsv = useCallback(() => {
    const blob = new Blob([buildCsv(resolved, items)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
  }, [resolved, items, filename]);

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

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <TemplateSection exportType={exportType} currentColumns={configured} onApply={setEdited} />

      <ColumnConfigList
        columns={configured}
        fields={fieldOptions}
        onChange={updateColumns}
        checkAvailability={queryStatus === 'success'}
        options={options}
        onOptionChange={setOption}
        t={t}
      />

      <PreviewTable
        columns={resolved.map((column) => ({ key: column.uid, label: column.header }))}
        rows={previewRows}
        totalCount={items.length}
        previewLimit={PREVIEW_LIMIT}
        ariaLabel={t('table.ariaLabel')}
        titleLabel={(vars) => t('preview.title', vars)}
        rowCountLabel={(vars) => t('preview.rowCount', vars)}
        errorLabel={t('preview.error')}
        refreshLabel={t('actions.refetch')}
        refetch={refetch}
        queryStatus={queryStatus}
      />

      <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          onPress={handleExport}
          isDisabled={resolved.length === 0 || items.length === 0 || isExporting || cannotExport}
          isPending={isExporting}
          data-cy="resource-usage-export-download-csv-button"
        >
          <DownloadIcon className="size-4" />
          {t('actions.downloadCsv')}
        </Button>
      </div>
    </div>
  );
}
