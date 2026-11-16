// Shared CSV export page content — template section, column editor, preview table, download button
// FEATURE: CSV export — rendered as normal page content for every export type
import { QueryStatus } from '@tanstack/react-query';
import { CsvExportType } from '@attraccess/react-query-client';
import { DownloadIcon } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { triggerDownload } from '../../../utils/download';
import { ColumnConfigList, FieldOption, OptionLite } from './column-config-list';
import { buildCsv, ConfiguredColumn, defaultColumns, FieldDefinition, resolveColumns } from './csv';
import { PreviewTable } from './preview-table';
import { TemplateSection } from './template-section';
import de from './de.json';
import en from './en.json';

const PREVIEW_LIMIT = 5;

export type Row = {
  id: string | number;
  [key: string]: unknown;
};

interface Props<TData extends Row> {
  exportType: CsvExportType;
  /** Every data field the export type offers (the column editor's choices). */
  fields: FieldDefinition<TData>[];
  items: TData[];
  refetch?: () => unknown;
  options?: OptionLite[];
  setOption?: (key: string, nextValue: boolean) => void;
  filename: string;
  queryStatus: QueryStatus;
  /** False while more pages exist: resource metadata fields are only known for the loaded rows. */
  allPagesLoaded?: boolean;
  onFetchAllPages?: () => void;
  isFetchingAllPages?: boolean;
}

/**
 * The field list is rebuilt on every page arrival or refetch. Deriving the editor's inputs from a
 * serialised form keeps them referentially stable while their content is unchanged, so the memoised
 * column rows neither re-render nor (through new uids) remount.
 */
function useStableFieldInputs<TData>(fields: FieldDefinition<TData>[]) {
  const optionsSignature = useMemo(() => JSON.stringify(fields.map(({ key, label }) => [key, label])), [fields]);
  const fieldOptions = useMemo<FieldOption[]>(
    () => (JSON.parse(optionsSignature) as [string, string][]).map(([key, label]) => ({ key, label })),
    [optionsSignature],
  );
  const defaultsSignature = useMemo(() => JSON.stringify(defaultColumns(fields)), [fields]);
  const defaults = useMemo(() => JSON.parse(defaultsSignature) as ConfiguredColumn[], [defaultsSignature]);
  return { fieldOptions, defaults };
}

export function CsvExportConfigContent<TData extends Row>(props: Props<TData>) {
  const {
    exportType,
    fields,
    items,
    refetch,
    options,
    setOption,
    filename,
    queryStatus,
    allPagesLoaded = true,
    onFetchAllPages,
    isFetchingAllPages,
  } = props;

  const { t } = useTranslations({ de, en });

  // null = untouched: follow the export type's default columns (they only exist once the data fields do).
  // Fields appearing later (resource metadata keys, billing configuration) must never reset user edits.
  const [edited, setEdited] = useState<ConfiguredColumn[] | null>(null);
  const { fieldOptions, defaults } = useStableFieldInputs(fields);
  const configured = edited ?? defaults;
  const updateColumns = useCallback(
    (update: (columns: ConfiguredColumn[]) => ConfiguredColumn[]) =>
      setEdited((current) => update(current ?? defaults)),
    [defaults],
  );

  // The download always uses `resolved`; the preview may lag a keystroke behind while typing.
  const resolved = useMemo(() => resolveColumns(configured, fields), [configured, fields]);
  const previewColumns = useDeferredValue(resolved);

  const previewHeaders = useMemo(
    () => previewColumns.map((column) => ({ key: column.uid, label: column.header })),
    [previewColumns],
  );
  const previewRows = useMemo(
    () =>
      items.slice(0, PREVIEW_LIMIT).map((item) => ({
        key: String(item.id),
        columns: previewColumns.map((column) => ({ key: column.uid, value: column.getValue(item) })),
      })),
    [items, previewColumns],
  );
  const titleLabel = useCallback((vars: { count: number }) => t('preview.title', vars), [t]);
  const rowCountLabel = useCallback((vars: { count: number }) => t('preview.rowCount', vars), [t]);

  const downloadCsv = useCallback(() => {
    triggerDownload(
      buildCsv(resolved, items),
      filename.endsWith('.csv') ? filename : `${filename}.csv`,
      'text/csv;charset=utf-8',
    );
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
        allPagesLoaded={allPagesLoaded}
        options={options}
        onOptionChange={setOption}
        t={t}
      />

      <PreviewTable
        columns={previewHeaders}
        rows={previewRows}
        totalCount={items.length}
        previewLimit={PREVIEW_LIMIT}
        ariaLabel={t('table.ariaLabel')}
        titleLabel={titleLabel}
        rowCountLabel={rowCountLabel}
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
