import { Button, Input } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TFunction } from '@attraccess/plugins-frontend-ui';

type MetadataValue = Record<string, unknown>;

interface MetadataEntry {
  id: string;
  key: string;
  value: string;
  originalValue?: unknown;
  useOriginalValue: boolean;
}

interface ResourceMetadataEditorProps {
  t: TFunction;
  value?: MetadataValue;
  onChange: (value: MetadataValue) => void;
}

const createEntryId = () => Math.random().toString(36).slice(2, 10);

const formatMetadataValue = (value: unknown): string => {
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

const parseMetadataValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

const normalizeMetadata = (metadata?: MetadataValue): MetadataEntry[] => {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }
  return Object.entries(metadata).map(([key, value]) => ({
    id: createEntryId(),
    key,
    value: formatMetadataValue(value),
    originalValue: value,
    useOriginalValue: true,
  }));
};

const buildMetadata = (entries: MetadataEntry[]): MetadataValue => {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) {
      continue;
    }
    const value = entry.useOriginalValue ? entry.originalValue : parseMetadataValue(entry.value);
    result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : {};
};

export function ResourceMetadataEditor({ t, value, onChange }: ResourceMetadataEditorProps) {
  const [entries, setEntries] = useState<MetadataEntry[]>(() => normalizeMetadata(value));
  const shouldSyncRef = useRef(true);
  const lastKeyInputRef = useRef<HTMLInputElement>(null);
  const [shouldFocusNewRow, setShouldFocusNewRow] = useState(false);

  useEffect(() => {
    if (!shouldSyncRef.current) {
      shouldSyncRef.current = true;
      return;
    }
    setEntries(normalizeMetadata(value));
  }, [value]);

  useEffect(() => {
    if (shouldFocusNewRow && lastKeyInputRef.current) {
      lastKeyInputRef.current.focus();
      setShouldFocusNewRow(false);
    }
  }, [shouldFocusNewRow]);

  const updateEntries = useCallback(
    (nextEntries: MetadataEntry[]) => {
      shouldSyncRef.current = false;
      setEntries(nextEntries);
      onChange(buildMetadata(nextEntries));
    },
    [onChange],
  );

  const handleAddEntry = () => {
    updateEntries([
      ...entries,
      {
        id: createEntryId(),
        key: '',
        value: '',
        useOriginalValue: false,
      },
    ]);
    setShouldFocusNewRow(true);
  };

  const handleRemoveEntry = (id: string) => {
    updateEntries(entries.filter((entry) => entry.id !== id));
  };

  const handleKeyChange = (id: string, nextKey: string) => {
    updateEntries(entries.map((entry) => (entry.id === id ? { ...entry, key: nextKey } : entry)));
  };

  const handleValueChange = (id: string, nextValue: string) => {
    updateEntries(
      entries.map((entry) =>
        entry.id === id ? { ...entry, value: nextValue, useOriginalValue: false } : entry,
      ),
    );
  };

  return (
    <div className="rounded-lg border border-default-200 dark:border-default-100 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-default-600">{t('inputs.metadata.label')}</p>
          <p className="text-xs text-default-500">{t('inputs.metadata.description')}</p>
        </div>
        <Button variant="secondary"
          size="sm"
          startContent={<Plus className="w-4 h-4" />}
          className="w-full sm:w-auto whitespace-nowrap"
          onPress={handleAddEntry}
        >
          {t('inputs.metadata.actions.add')}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-default-500">{t('inputs.metadata.empty')}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={entry.id} className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                value={entry.key}
                placeholder={t('inputs.metadata.key.placeholder')}
                aria-label={t('inputs.metadata.key.label')}
                onChange={(event) => handleKeyChange(entry.id, event.target.value)}
                className="flex-1"
                ref={index === entries.length - 1 ? lastKeyInputRef : undefined}
              />
              <Input
                value={entry.value}
                placeholder={t('inputs.metadata.value.placeholder')}
                aria-label={t('inputs.metadata.value.label')}
                onChange={(event) => handleValueChange(entry.id, event.target.value)}
                className="flex-1"
              />
              <Button variant="danger-soft"
                size="sm"
                startContent={<Trash2 className="w-4 h-4" />}
                className="w-full sm:w-auto"
                onPress={() => handleRemoveEntry(entry.id)}
              >
                {t('inputs.metadata.actions.remove')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
