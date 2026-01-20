import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { EmptyState } from '../../../components/emptyState';

interface Props {
  t: TFunction;
  metadata?: Record<string, unknown>;
  onChange: (metadata: Record<string, unknown>) => void;
}

const stringifyMetadataValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export function ResourceMetadataEditor(props: Props) {
  const { t, metadata, onChange } = props;

  const rows = useMemo(
    () =>
      Object.entries(metadata ?? {}).map(([key, value], index) => ({
        id: `${key || 'empty'}-${index}`,
        key,
        value,
      })),
    [metadata],
  );

  const handleKeyChange = useCallback(
    (currentKey: string, nextKey: string) => {
      const currentMetadata = metadata ?? {};
      const normalizedKey = nextKey.trim();
      const newKey = normalizedKey === '' ? '' : normalizedKey;
      const nextMetadata = { ...currentMetadata };
      const currentValue = nextMetadata[currentKey];
      delete nextMetadata[currentKey];
      nextMetadata[newKey] = currentValue ?? '';
      onChange(nextMetadata);
    },
    [metadata, onChange],
  );

  const handleValueChange = useCallback(
    (key: string, nextValue: string) => {
      onChange({ ...(metadata ?? {}), [key]: nextValue });
    },
    [metadata, onChange],
  );

  const handleRemove = useCallback(
    (key: string) => {
      const nextMetadata = { ...(metadata ?? {}) };
      delete nextMetadata[key];
      onChange(nextMetadata);
    },
    [metadata, onChange],
  );

  const handleAdd = useCallback(() => {
    const currentMetadata = metadata ?? {};
    if (Object.prototype.hasOwnProperty.call(currentMetadata, '')) {
      return;
    }
    onChange({ ...currentMetadata, '': '' });
  }, [metadata, onChange]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-small font-medium">{t('inputs.metadata.label')}</span>
        <span className="text-tiny text-default-400">{t('inputs.metadata.description')}</span>
      </div>

      <Table removeWrapper aria-label={t('inputs.metadata.table.ariaLabel')}>
        <TableHeader>
          <TableColumn>{t('inputs.metadata.table.columns.key')}</TableColumn>
          <TableColumn>{t('inputs.metadata.table.columns.value')}</TableColumn>
          <TableColumn className="w-[1%]">{t('inputs.metadata.table.columns.actions')}</TableColumn>
        </TableHeader>
        <TableBody items={rows} emptyContent={<EmptyState message={t('inputs.metadata.table.empty')} />}>
          {(row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Input
                  size="sm"
                  value={row.key}
                  placeholder={t('inputs.metadata.placeholders.key')}
                  aria-label={t('inputs.metadata.table.columns.key')}
                  onValueChange={(nextKey) => handleKeyChange(row.key, nextKey)}
                />
              </TableCell>
              <TableCell>
                <Input
                  size="sm"
                  value={stringifyMetadataValue(row.value)}
                  placeholder={t('inputs.metadata.placeholders.value')}
                  aria-label={t('inputs.metadata.table.columns.value')}
                  onValueChange={(nextValue) => handleValueChange(row.key, nextValue)}
                />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isIconOnly
                  onPress={() => handleRemove(row.key)}
                  aria-label={t('inputs.metadata.actions.remove')}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Button size="sm" variant="flat" startContent={<PlusIcon className="h-4 w-4" />} onPress={handleAdd}>
        {t('inputs.metadata.actions.add')}
      </Button>
    </div>
  );
}
