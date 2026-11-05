import React, { useRef, useState } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const isFull = maxEntries !== undefined && values.length >= maxEntries;
  // Part of the field's description, so screen readers announce which defaults apply or why Add is disabled.
  const hint = isFull
    ? error
      ? null
      : t('limitReached', { max: maxEntries })
    : values.length === 0
      ? emptyHint
      : null;

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

  // Tags are keyed by position, so stored duplicates stay distinct and can be removed one at a time.
  const remove = (keys: Set<Key>) => {
    const remaining = values.filter((_, index) => !keys.has(String(index)));
    onChange(remaining);
    setError(null);
    // The tag list disappears with its last entry; keep keyboard focus in the field.
    if (remaining.length === 0) inputRef.current?.focus();
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
        <div
          ref={rowRef}
          className="flex gap-2"
          onBlur={(event) => {
            // A typed entry must not get lost when the user moves on (e.g. straight to Save) without
            // adding it. Moving between the input and Add, or away from the browser window, keeps the draft.
            if (!draft.trim() || !document.hasFocus() || rowRef.current?.contains(event.relatedTarget as Node | null)) {
              return;
            }
            add();
          }}
        >
          <Input
            ref={inputRef}
            className="flex-1"
            placeholder={placeholder}
            data-cy={dataCy}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
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
        {(description || hint) && (
          <Description>
            {description}
            {hint && <span className="block">{hint}</span>}
          </Description>
        )}
        {error && <FieldError>{t(error, { max: error === 'tooLong' ? maxLength : maxEntries })}</FieldError>}
      </TextField>
      {values.length > 0 && (
        <TagGroup size="sm" aria-label={label} onRemove={isDisabled ? undefined : remove}>
          <TagGroup.List>
            {values.map((value, index) => (
              <Tag key={index} id={String(index)} textValue={value} className="max-w-full">
                {(renderProps) => (
                  <>
                    {/* Entries such as URNs have no break opportunities; let them wrap instead of overflowing. */}
                    <span className="min-w-0 break-all">{value}</span>
                    {renderProps.allowsRemoving ? (
                      <Tag.RemoveButton aria-label={t('remove')} className="shrink-0" />
                    ) : null}
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
