// Ordered column editor for the CSV export page — field/constant rows, headers, reorder, remove
// FEATURE: CSV export — configure which columns are exported, with what header and in which order
import { Button, Checkbox, Chip, Input, Label, TextField } from '@heroui/react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback } from 'react';
import { Select } from '../../../components/select';
import { ConfiguredColumn, newColumnUid } from './csv';

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
  onChange: (columns: ConfiguredColumn[]) => void;
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

export function ColumnConfigList(props: Props) {
  const { columns, fields, onChange, options, onOptionChange, t } = props;

  const update = useCallback(
    (index: number, patch: Partial<ConfiguredColumn>) =>
      onChange(columns.map((column, i) => (i === index ? { ...column, ...patch } : column))),
    [columns, onChange],
  );

  const addField = useCallback(
    () => onChange([...columns, { uid: newColumnUid(), type: 'field', fieldKey: fields[0]?.key, header: '' }]),
    [columns, fields, onChange],
  );
  const addConstant = useCallback(
    () => onChange([...columns, { uid: newColumnUid(), type: 'constant', header: '', value: '' }]),
    [columns, onChange],
  );

  return (
    <section className="flex min-w-0 flex-col gap-3" data-cy="csv-export-column-config">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('columns.title')}</h2>
        <p className="text-sm text-muted">{t('columns.description')}</p>
      </div>

      {columns.length === 0 && <p className="text-sm text-muted">{t('columns.empty')}</p>}

      <ol className="flex flex-col gap-3" aria-label={t('columns.title')}>
        {columns.map((column, index) => {
          const fieldKnown = column.type === 'field' && fields.some((field) => field.key === column.fieldKey);
          const isStale = column.type === 'field' && !fieldKnown;
          const defaultLabel = fields.find((field) => field.key === column.fieldKey)?.label ?? '';
          // a stale key stays selectable so the template keeps it; it is flagged below
          const items =
            isStale && column.fieldKey ? [{ key: column.fieldKey, label: column.fieldKey }, ...fields] : fields;
          const position = index + 1;

          return (
            <li
              key={column.uid}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 md:flex-row md:items-start"
              data-cy="csv-export-column-row"
            >
              <Chip size="sm" variant="soft" className="self-start md:mt-8">
                {column.type === 'field' ? t('columns.type.field') : t('columns.type.constant')}
              </Chip>

              <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {column.type === 'field' ? (
                    <>
                      <Label className="text-sm font-medium">{t('columns.field')}</Label>
                      <Select
                        aria-label={t('columns.fieldAria', { n: position })}
                        value={column.fieldKey}
                        items={items}
                        onChange={(key) => update(index, { fieldKey: key })}
                        placeholder={t('columns.fieldPlaceholder')}
                        isInvalid={isStale}
                        fullWidth
                        data-cy="csv-export-column-field"
                      />
                      {isStale && (
                        <p className="text-xs text-warning" data-cy="csv-export-column-unavailable">
                          {t('columns.unavailable')}
                        </p>
                      )}
                    </>
                  ) : (
                    <TextField
                      value={column.value ?? ''}
                      onChange={(value) => update(index, { value })}
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
                  onChange={(header) => update(index, { header })}
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

              <div className="flex gap-1 self-end md:mt-6 md:self-start">
                <Button
                  isIconOnly
                  size="sm"
                  variant="outline"
                  aria-label={t('columns.moveUp', { n: position })}
                  isDisabled={index === 0}
                  onPress={() => onChange(move(columns, index, index - 1))}
                  data-cy="csv-export-column-up"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="outline"
                  aria-label={t('columns.moveDown', { n: position })}
                  isDisabled={index === columns.length - 1}
                  onPress={() => onChange(move(columns, index, index + 1))}
                  data-cy="csv-export-column-down"
                >
                  <ArrowDownIcon className="size-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="outline"
                  aria-label={t('columns.remove', { n: position })}
                  onPress={() => onChange(columns.filter((_, i) => i !== index))}
                  data-cy="csv-export-column-remove"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onPress={addField} data-cy="csv-export-add-field">
          <PlusIcon className="size-4" />
          {t('columns.addField')}
        </Button>
        <Button size="sm" variant="outline" onPress={addConstant} data-cy="csv-export-add-constant">
          <PlusIcon className="size-4" />
          {t('columns.addConstant')}
        </Button>
      </div>

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
