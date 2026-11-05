import React, { useState } from 'react';
import { Button, Description, FieldError, Input, Label, Tag, TagGroup, TextField } from '@heroui/react';
import type { Key } from '@heroui/react';
import { useTranslations } from '../../i18n';
import en from './StringListField.en.json';
import de from './StringListField.de.json';

export type StringListEntryError = 'empty' | 'duplicate' | 'comma' | 'control' | 'tooLong' | 'limitReached';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Checks a candidate entry (already trimmed) against the list; returns why it cannot be added, if so. */
export function validateStringListEntry(
  entry: string,
  values: readonly string[],
  { maxEntries, maxLength }: { maxEntries?: number; maxLength?: number } = {},
): StringListEntryError | null {
  if (maxEntries !== undefined && values.length >= maxEntries) return 'limitReached';
  if (entry.length === 0) return 'empty';
  if (entry.includes(',')) return 'comma';
  if (CONTROL_CHARACTERS.test(entry)) return 'control';
  if (maxLength !== undefined && entry.length > maxLength) return 'tooLong';
  if (values.includes(entry)) return 'duplicate';
  return null;
}

export interface StringListFieldProps {
  label: string;
  description?: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Shown while the list is empty, e.g. which defaults apply. */
  emptyHint?: React.ReactNode;
  maxEntries?: number;
  maxLength?: number;
  isDisabled?: boolean;
  'data-cy'?: string;
}

/**
 * Edits an ordered list of strings, one entry at a time. Entries are never split on commas, so values
 * that contain them cannot be created by accident; entries keep the order in which they were added.
 */
export const StringListField: React.FC<StringListFieldProps> = ({
  label,
  description,
  values,
  onChange,
  placeholder,
  emptyHint,
  maxEntries,
  maxLength,
  isDisabled,
  'data-cy': dataCy,
}) => {
  const { t } = useTranslations({ en, de });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<StringListEntryError | null>(null);
  const isFull = maxEntries !== undefined && values.length >= maxEntries;

  const add = () => {
    const entry = draft.trim();
    const problem = validateStringListEntry(entry, values, { maxEntries, maxLength });
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...values, entry]);
    setDraft('');
    setError(null);
  };

  const remove = (keys: Set<Key>) => {
    onChange(values.filter((value) => !keys.has(value)));
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2" data-cy={dataCy ? `${dataCy}-list` : undefined}>
      <TextField
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setError(null);
        }}
        isDisabled={isDisabled}
        isInvalid={error !== null}
        validationBehavior="aria"
      >
        <Label>{label}</Label>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder={placeholder}
            data-cy={dataCy}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Enter adds the entry; it must never submit the surrounding form.
              event.preventDefault();
              add();
            }}
          />
          <Button
            variant="secondary"
            onPress={add}
            isDisabled={isDisabled || isFull}
            data-cy={dataCy && `${dataCy}-add`}
          >
            {t('add')}
          </Button>
        </div>
        {description && <Description>{description}</Description>}
        {error && <FieldError>{t(error, { max: error === 'tooLong' ? maxLength : maxEntries })}</FieldError>}
      </TextField>
      {isFull && !error && <p className="text-sm text-muted">{t('limitReached', { max: maxEntries })}</p>}
      {values.length === 0 ? (
        emptyHint && <p className="text-sm text-muted">{emptyHint}</p>
      ) : (
        <TagGroup size="sm" aria-label={label} onRemove={isDisabled ? undefined : remove}>
          <TagGroup.List>
            {values.map((value) => (
              <Tag key={value} id={value} textValue={value}>
                {(renderProps) => (
                  <>
                    {value}
                    {renderProps.allowsRemoving ? <Tag.RemoveButton /> : null}
                  </>
                )}
              </Tag>
            ))}
          </TagGroup.List>
        </TagGroup>
      )}
    </div>
  );
};
