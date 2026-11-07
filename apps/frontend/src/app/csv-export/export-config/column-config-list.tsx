// Ordered column editor for the CSV export page — field/constant rows, headers, reorder, remove
// FEATURE: CSV export — configure which columns are exported, with what header and in which order
import { Button, Checkbox, Chip, Input, Label, TextField } from '@heroui/react';
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { Select } from '../../../components/select';
import { ConfiguredColumn, MAX_COLUMNS, newColumnUid } from './csv';

export interface FieldOption {
  key: string;
  label: string;
}

export interface OptionLite {
  key: string;
  label: string;
  value: boolean;
}

interface Props {
  columns: ConfiguredColumn[];
  fields: FieldOption[];
  /** Functional update so the row callbacks stay stable and rows can be memoised. */
  onChange: (update: (columns: ConfiguredColumn[]) => ConfiguredColumn[]) => void;
  /** False while the data is (re)loading: a field can only be judged unavailable once the data is there. */
  checkAvailability?: boolean;
  options?: OptionLite[];
  onOptionChange?: (key: string, next: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface RowProps {
  column: ConfiguredColumn;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  fields: FieldOption[];
  checkAvailability: boolean;
  onPatch: (uid: string, patch: Partial<ConfiguredColumn>) => void;
  onMove: (uid: string, offset: -1 | 1) => void;
  onRemove: (uid: string) => void;
  t: Props['t'];
}

// Memoised: every row owns a Select over all fields, so re-rendering all rows per keystroke gets slow.
const ColumnRow = memo(function ColumnRow(props: RowProps) {
  const { column, position, isFirst, isLast, fields, checkAvailability, onPatch, onMove, onRemove, t } = props;

  const fieldKnown = column.type === 'field' && fields.some((field) => field.key === column.fieldKey);
  const isStale = checkAvailability && column.type === 'field' && !fieldKnown;
  const defaultLabel = fields.find((field) => field.key === column.fieldKey)?.label ?? '';
  // a stale key stays selectable so the template keeps it; it is flagged below
  const items = useMemo(
    () =>
      column.type === 'field' && !fieldKnown && column.fieldKey
        ? [{ key: column.fieldKey, label: column.fieldKey }, ...fields]
        : fields,
    [column.type, column.fieldKey, fieldKnown, fields],
  );

  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 @2xl:flex-row @2xl:items-start"
      data-cy="csv-export-column-row"
    >
      <Chip size="sm" variant="soft" className="self-start @2xl:mt-8">
        {column.type === 'field' ? t('columns.type.field') : t('columns.type.constant')}
      </Chip>

      <div className="flex min-w-0 flex-1 flex-col gap-2 @2xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {column.type === 'field' ? (
            <>
              <Label className="text-sm font-medium">{t('columns.field')}</Label>
              <Select
                aria-label={t('columns.fieldAria', { n: position })}
                value={column.fieldKey}
                items={items}
                onChange={(key) => onPatch(column.uid, { fieldKey: key })}
                placeholder={t('columns.fieldPlaceholder')}
                isInvalid={isStale}
                fullWidth
                data-cy="csv-export-column-field"
              />
              {isStale && (
                <p className="flex items-start gap-1 text-xs" data-cy="csv-export-column-unavailable">
                  <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
                  {t('columns.unavailable')}
                </p>
              )}
            </>
          ) : (
            <TextField
              value={column.value ?? ''}
              onChange={(value) => onPatch(column.uid, { value })}
              maxLength={1024}
              fullWidth
            >
              <Label className="text-sm font-medium">{t('columns.value')}</Label>
              <Input data-cy="csv-export-column-value" />
            </TextField>
          )}
        </div>

        <TextField
          value={column.header}
          onChange={(header) => onPatch(column.uid, { header })}
          maxLength={255}
          className="min-w-0 flex-1"
          fullWidth
        >
          <Label className="text-sm font-medium">{t('columns.header')}</Label>
          <Input
            placeholder={column.type === 'field' ? defaultLabel || (column.fieldKey ?? '') : ''}
            data-cy="csv-export-column-header"
          />
        </TextField>
      </div>

      <div className="flex gap-1 self-end @2xl:mt-6 @2xl:self-start">
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label={t('columns.moveUp', { n: position })}
          isDisabled={isFirst}
          onPress={() => onMove(column.uid, -1)}
          data-cy="csv-export-column-up"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label={t('columns.moveDown', { n: position })}
          isDisabled={isLast}
          onPress={() => onMove(column.uid, 1)}
          data-cy="csv-export-column-down"
        >
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label={t('columns.remove', { n: position })}
          onPress={() => onRemove(column.uid)}
          data-cy="csv-export-column-remove"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </li>
  );
});

export function ColumnConfigList(props: Props) {
  const { columns, fields, onChange, checkAvailability = true, options, onOptionChange, t } = props;

  const patchColumn = useCallback(
    (uid: string, patch: Partial<ConfiguredColumn>) =>
      onChange((current) => current.map((column) => (column.uid === uid ? { ...column, ...patch } : column))),
    [onChange],
  );
  const moveColumn = useCallback(
    (uid: string, offset: -1 | 1) =>
      onChange((current) => {
        const index = current.findIndex((column) => column.uid === uid);
        return index < 0 ? current : move(current, index, index + offset);
      }),
    [onChange],
  );
  const removeColumn = useCallback(
    (uid: string) => onChange((current) => current.filter((column) => column.uid !== uid)),
    [onChange],
  );

  const addField = useCallback(
    () =>
      onChange((current) => [...current, { uid: newColumnUid(), type: 'field', fieldKey: fields[0]?.key, header: '' }]),
    [fields, onChange],
  );
  const addConstant = useCallback(
    () => onChange((current) => [...current, { uid: newColumnUid(), type: 'constant', header: '', value: '' }]),
    [onChange],
  );
  // the API rejects templates with more columns than this
  const atLimit = columns.length >= MAX_COLUMNS;

  return (
    <section className="flex min-w-0 flex-col gap-3" data-cy="csv-export-column-config">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('columns.title')}</h2>
        <p className="text-sm text-muted">{t('columns.description')}</p>
      </div>

      {columns.length === 0 && <p className="text-sm text-muted">{t('columns.empty')}</p>}

      <ol className="@container flex flex-col gap-3" aria-label={t('columns.title')}>
        {columns.map((column, index) => (
          <ColumnRow
            key={column.uid}
            column={column}
            position={index + 1}
            isFirst={index === 0}
            isLast={index === columns.length - 1}
            fields={fields}
            checkAvailability={checkAvailability}
            onPatch={patchColumn}
            onMove={moveColumn}
            onRemove={removeColumn}
            t={t}
          />
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" isDisabled={atLimit} onPress={addField} data-cy="csv-export-add-field">
          <PlusIcon className="size-4" />
          {t('columns.addField')}
        </Button>
        <Button size="sm" variant="outline" isDisabled={atLimit} onPress={addConstant} data-cy="csv-export-add-constant">
          <PlusIcon className="size-4" />
          {t('columns.addConstant')}
        </Button>
      </div>
      {atLimit && <p className="text-xs text-muted">{t('columns.limit', { max: MAX_COLUMNS })}</p>}

      {(options ?? []).length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {(options ?? []).map((option) => (
            <Checkbox
              key={option.key}
              isSelected={option.value}
              onChange={(nextValue) => onOptionChange?.(option.key, nextValue)}
              data-cy="resource-usage-export-grouping-checkbox"
            >
              <Checkbox.Content className="items-start">
                <Checkbox.Control className="mt-0.5">
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {option.label}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      )}
    </section>
  );
}
