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
  /** Splits the typed text into entries, e.g. a pasted list. Without it the whole trimmed text is one entry. */
  parseEntries?: (draft: string) => string[];
  /** A further check of each entry; returns the message to show, or null when the entry is fine. */
  validateEntry?: (entry: string) => string | null;
  /** Whether two entries are the same value, e.g. two spellings of one address. Without it: the same text. */
  isSameEntry?: (a: string, b: string) => boolean;
  /** A problem with the list as a whole, shown and announced like an entry error. */
  errorMessage?: string | null;
  /** Shows the label to screen readers only, for a field whose surrounding row already shows it. */
  isLabelHidden?: boolean;
  'data-cy'?: string;
}

type EntryProblem = { code: StringListEntryError } | { message: string };

/**
 * Edits an ordered list of strings, one entry at a time. Entries are never split on commas unless
 * `parseEntries` says so, so values that contain them cannot be created by accident; entries keep the
 * order in which they were added. With `parseEntries`, an entry already in the list is skipped and the
 * others are added; an invalid entry adds nothing.
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
  parseEntries,
  validateEntry,
  isSameEntry = (a, b) => a === b,
  errorMessage,
  isLabelHidden,
  'data-cy': dataCy,
}) => {
  const { t } = useTranslations({ en, de });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<EntryProblem | null>(null);
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
    if (isFull) {
      setError({ code: 'limitReached' });
      return;
    }
    const entries = parseEntries ? parseEntries(draft) : [draft.trim()];
    if (entries.length === 0) entries.push('');
    const fresh: string[] = [];
    for (const entry of entries) {
      // Duplicates and the limit are judged below, against the list plus the entries taken so far.
      const code = validateStringListEntry(entry, [], { maxLength });
      if (code) {
        setError({ code });
        return;
      }
      const message = validateEntry?.(entry);
      if (message) {
        setError({ message });
        return;
      }
      if (![...values, ...fresh].some((known) => isSameEntry(known, entry))) fresh.push(entry);
    }
    if (fresh.length === 0) {
      setError({ code: 'duplicate' });
      return;
    }
    if (maxEntries !== undefined && values.length + fresh.length > maxEntries) {
      setError({ code: 'limitReached' });
      return;
    }
    onChange([...values, ...fresh]);
    setDraft('');
    setError(null);
  };
  const errorText = error
    ? 'message' in error
      ? error.message
      : t(error.code, { max: error.code === 'tooLong' ? maxLength : maxEntries })
    : errorMessage;

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
        isInvalid={Boolean(errorText)}
        validationBehavior="aria"
      >
        <Label className={isLabelHidden ? 'sr-only' : undefined}>{label}</Label>
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
        {errorText && <FieldError>{errorText}</FieldError>}
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
