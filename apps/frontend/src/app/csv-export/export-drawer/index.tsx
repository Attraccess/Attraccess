// Shared CSV export configuration content — templates, column picker, column config, preview, download
// FEATURE: CSV export — body and footer used by every export type
import { Button } from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { CsvExportTemplate, CsvExportTemplateColumnDto, CsvExportTemplateColumnType, CsvExportType } from './template-api';
import { ColumnPicker } from './column-picker';
import { ColumnConfigList } from './column-config-list';
import { TemplateSection } from './template-section';
import { PreviewTable } from './preview-table';
import { buildCsv, ConfiguredColumn } from './csv';
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
  exportType: CsvExportType;
  onCancel?: () => void;
}

interface ItemRow {
  key: string;
  columns: Array<{ key: string; value: string }>;
}

export function CsvExportDrawerContent<TData extends Row>(props: Props<TData>) {
  const { columns, items, refetch, options, setOption, filename, queryStatus, exportType, onCancel } = props;

  const { t } = useTranslations({ de, en });

  const uidCounter = useRef(0);
  const nextUid = useCallback(() => `col-${uidCounter.current++}`, []);

  const columnsByKey = useMemo(() => new Map(columns.map((col) => [col.key, col])), [columns]);

  const defaultConfiguration = useCallback(
    (): ConfiguredColumn[] =>
      columns
        .filter((col) => col.selectedByDefault)
        .map((col) => ({ uid: nextUid(), type: 'field', fieldKey: col.key, header: '' })),
    [columns, nextUid],
  );

  const [configured, setConfigured] = useState<ConfiguredColumn[]>(defaultConfiguration);

  // When the available columns change (e.g. metadata columns appear once data is loaded),
  // drop configured columns whose field vanished but keep the user's configuration otherwise.
  const columnKeySignature = useMemo(() => columns.map((col) => col.key).join('|'), [columns]);
  useEffect(() => {
    setConfigured((previous) => {
      const valid = previous.filter(
        (column) => column.type === 'constant' || columnsByKey.has(column.fieldKey ?? ''),
      );
      if (valid.length > 0) {
        return valid.length === previous.length ? previous : valid;
      }
      return defaultConfiguration();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-evaluate only when the set of available columns changes
  }, [columnKeySignature]);

  const selectedFieldKeys = useMemo(
    () =>
      configured
        .filter((column) => column.type === 'field')
        .map((column) => column.fieldKey)
        .filter((key): key is string => Boolean(key)),
    [configured],
  );

  const handlePickerChange = useCallback(
    (keys: string[]) => {
      setConfigured((previous) => {
        const kept = previous.filter(
          (column) => column.type === 'constant' || keys.includes(column.fieldKey ?? ''),
        );
        const existing = new Set(
          previous.filter((column) => column.type === 'field').map((column) => column.fieldKey),
        );
        const added: ConfiguredColumn[] = keys
          .filter((key) => !existing.has(key))
          .map((key) => ({ uid: nextUid(), type: 'field', fieldKey: key, header: '' }));
        return [...kept, ...added];
      });
    },
    [nextUid],
  );

  const addConstantColumn = useCallback(() => {
    setConfigured((previous) => [...previous, { uid: nextUid(), type: 'constant', header: '', value: '' }]);
  }, [nextUid]);

  const getFieldLabel = useCallback((fieldKey: string) => columnsByKey.get(fieldKey)?.label ?? fieldKey, [columnsByKey]);

  const resolveHeader = useCallback(
    (column: ConfiguredColumn) => {
      if (column.header.trim().length > 0) {
        return column.header;
      }
      return column.type === 'field' ? getFieldLabel(column.fieldKey ?? '') : '';
    },
    [getFieldLabel],
  );

  const resolveValue = useCallback(
    (column: ConfiguredColumn, item: TData) => {
      if (column.type === 'constant') {
        return column.value ?? '';
      }
      const definition = columnsByKey.get(column.fieldKey ?? '');
      return String(definition?.getter(item) ?? '');
    },
    [columnsByKey],
  );

  const itemRows: ItemRow[] = useMemo(() => {
    return items.map((item, index) => ({
      key: `${item.id}-${index}`,
      columns: configured.map((column) => ({
        key: column.uid,
        value: resolveValue(column, item),
      })),
    }));
  }, [items, configured, resolveValue]);

  const downloadCsv = useCallback(() => {
    const csv = buildCsv(
      configured.map((column) => ({
        header: resolveHeader(column),
        getValue: (rowIndex: number) => resolveValue(column, items[rowIndex]),
      })),
      items.length,
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
  }, [configured, items, filename, resolveHeader, resolveValue]);

  const columnsLite = useMemo(() => columns.map((c) => ({ key: c.key, label: c.label })), [columns]);

  // Serialized form of the current configuration, used for template save and dirty detection
  const currentTemplateColumns: CsvExportTemplateColumnDto[] = useMemo(
    () =>
      configured.map((column) =>
        column.type === 'field'
          ? {
              type: CsvExportTemplateColumnType.FIELD,
              header: column.header,
              fieldKey: column.fieldKey,
            }
          : {
              type: CsvExportTemplateColumnType.CONSTANT,
              header: column.header,
              value: column.value ?? '',
            },
      ),
    [configured],
  );

  const applyTemplate = useCallback(
    (template: CsvExportTemplate) => {
      setConfigured(
        template.columns
          .filter(
            (column) =>
              column.type === CsvExportTemplateColumnType.CONSTANT || columnsByKey.has(column.fieldKey ?? ''),
          )
          .map((column) =>
            column.type === CsvExportTemplateColumnType.FIELD
              ? { uid: nextUid(), type: 'field' as const, fieldKey: column.fieldKey ?? '', header: column.header }
              : { uid: nextUid(), type: 'constant' as const, header: column.header, value: column.value ?? '' },
          ),
      );
    },
    [columnsByKey, nextUid],
  );

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-24">
        <TemplateSection exportType={exportType} currentColumns={currentTemplateColumns} onApply={applyTemplate} />

        <ColumnPicker
          columns={columnsLite}
          selectedKeys={selectedFieldKeys}
          onSelectionChange={handlePickerChange}
          options={options}
          onOptionChange={setOption}
          searchLabel={t('inputs.columns.label')}
          searchPlaceholder={t('inputs.columns.search')}
          selectAllLabel={t('inputs.columns.selectAll')}
          selectNoneLabel={t('inputs.columns.selectNone')}
          selectedCountLabel={(vars) => t('inputs.columns.selectedCount', vars)}
        />

        <ColumnConfigList
          columns={configured}
          getFieldLabel={getFieldLabel}
          onChange={setConfigured}
          onAddConstant={addConstantColumn}
          title={t('columnsConfig.title')}
          emptyLabel={t('columnsConfig.empty')}
          fieldChipLabel={t('columnsConfig.field')}
          constantChipLabel={t('columnsConfig.constant')}
          headerLabel={t('columnsConfig.headerLabel')}
          constantValueLabel={t('columnsConfig.valueLabel')}
          addConstantLabel={t('columnsConfig.addConstant')}
          moveUpLabel={t('columnsConfig.moveUp')}
          moveDownLabel={t('columnsConfig.moveDown')}
          removeLabel={t('columnsConfig.remove')}
        />

        <PreviewTable
          columns={configured.map((column) => ({ key: column.uid, label: resolveHeader(column) }))}
          rows={itemRows}
          totalCount={items.length}
          previewLimit={PREVIEW_LIMIT}
          ariaLabel={t('table.ariaLabel')}
          titleLabel={(vars) => t('preview.title', vars)}
          rowCountLabel={(vars) => t('preview.rowCount', vars)}
          refetch={refetch}
          queryStatus={queryStatus}
        />
      </div>
      <footer className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" className="w-full sm:w-auto" onPress={onCancel} data-cy="csv-export-drawer-cancel-button">
          {t('actions.cancel')}
        </Button>
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          onPress={() => downloadCsv()}
          isDisabled={configured.length === 0 || items.length === 0}
          data-cy="resource-usage-export-download-csv-button"
        >
          <DownloadIcon className="size-4" />
          {t('actions.downloadCsv')}
        </Button>
      </footer>
    </>
  );
}
