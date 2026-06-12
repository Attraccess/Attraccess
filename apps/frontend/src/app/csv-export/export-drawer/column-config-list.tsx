// Ordered column configuration for the CSV export drawer
// FEATURE: CSV export — reorder columns, override headers, add constant-value columns
import { Button, Chip, Input, TextField } from '@heroui/react';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { ConfiguredColumn } from './csv';

interface Props {
  columns: ConfiguredColumn[];
  // resolves the default label of a field column (used as header placeholder)
  getFieldLabel: (fieldKey: string) => string;
  onChange: (next: ConfiguredColumn[]) => void;
  onAddConstant: () => void;
  title: string;
  emptyLabel: string;
  fieldChipLabel: string;
  constantChipLabel: string;
  headerLabel: string;
  constantValueLabel: string;
  addConstantLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
}

export function ColumnConfigList(props: Props) {
  const {
    columns,
    getFieldLabel,
    onChange,
    onAddConstant,
    title,
    emptyLabel,
    fieldChipLabel,
    constantChipLabel,
    headerLabel,
    constantValueLabel,
    addConstantLabel,
    moveUpLabel,
    moveDownLabel,
    removeLabel,
  } = props;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) {
      return;
    }
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patch = (index: number, changes: Partial<ConfiguredColumn>) => {
    onChange(columns.map((column, i) => (i === index ? { ...column, ...changes } : column)));
  };

  const remove = (index: number) => {
    onChange(columns.filter((_, i) => i !== index));
  };

  return (
    <section className="flex min-w-0 flex-col gap-3" data-cy="csv-export-column-config">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button size="sm" variant="outline" onPress={onAddConstant} data-cy="csv-export-add-constant">
          <PlusIcon className="size-4" />
          {addConstantLabel}
        </Button>
      </div>

      {columns.length === 0 && <p className="text-sm text-muted">{emptyLabel}</p>}

      <ul className="flex flex-col gap-2">
        {columns.map((column, index) => (
          <li
            key={column.uid}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
            data-cy={`csv-export-column-row-${index}`}
          >
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={moveUpLabel}
                isDisabled={index === 0}
                onPress={() => move(index, -1)}
                data-cy={`csv-export-column-move-up-${index}`}
              >
                <ChevronUpIcon className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={moveDownLabel}
                isDisabled={index === columns.length - 1}
                onPress={() => move(index, 1)}
                data-cy={`csv-export-column-move-down-${index}`}
              >
                <ChevronDownIcon className="size-4" />
              </Button>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 shrink-0 items-center gap-2 sm:w-44">
                <Chip size="sm" color={column.type === 'field' ? 'accent' : 'default'}>
                  {column.type === 'field' ? fieldChipLabel : constantChipLabel}
                </Chip>
                {column.type === 'field' && (
                  <span className="truncate text-sm text-muted" title={getFieldLabel(column.fieldKey ?? '')}>
                    {getFieldLabel(column.fieldKey ?? '')}
                  </span>
                )}
              </div>

              <TextField
                value={column.header}
                onChange={(header) => patch(index, { header })}
                aria-label={headerLabel}
                className="flex-1"
                data-cy={`csv-export-column-header-${index}`}
              >
                <Input
                  placeholder={column.type === 'field' ? getFieldLabel(column.fieldKey ?? '') : headerLabel}
                />
              </TextField>

              {column.type === 'constant' && (
                <TextField
                  value={column.value ?? ''}
                  onChange={(value) => patch(index, { value })}
                  aria-label={constantValueLabel}
                  className="flex-1"
                  data-cy={`csv-export-column-value-${index}`}
                >
                  <Input placeholder={constantValueLabel} />
                </TextField>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={removeLabel}
              onPress={() => remove(index)}
              className="self-end sm:self-center"
              data-cy={`csv-export-column-remove-${index}`}
            >
              <XIcon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
