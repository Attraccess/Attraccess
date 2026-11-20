import { Button } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { useState, type FormEvent } from 'react';
import { useMatterTranslations } from '../i18n';
import type { Metadata } from './api';

export type MetadataField = keyof Metadata;

/** The backend's limits (backend/devices/schemas.ts). */
export const METADATA_LIMITS: Record<MetadataField, number> = { displayName: 100, description: 500, location: 100 };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Inline editor for a device's or endpoint's name, description and location (`fields` picks which). Validates the
 * lengths before saving and sends only what changed; empty text clears a field. Render it only with
 * `matter.devices.manage`.
 */
export function MetadataForm({
  value,
  fields,
  onSave,
  idPrefix,
}: Readonly<{
  value: Metadata;
  fields: readonly MetadataField[];
  onSave: (changes: Partial<Metadata>) => Promise<unknown>;
  idPrefix: string;
}>) {
  const { t } = useMatterTranslations();
  const stored: Record<MetadataField, string> = {
    displayName: value.displayName ?? '',
    description: value.description ?? '',
    location: value.location ?? '',
  };
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  // The stored values changed (another administrator, or this form's own save). An untouched form follows them; one
  // with edits keeps its edits, so nothing the user typed is lost.
  if (fields.some((field) => seen[field] !== stored[field])) {
    const untouched = fields.every((field) => draft[field].trim() === seen[field]);
    setSeen(stored);
    if (untouched) setDraft(stored);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes: Partial<Metadata> = {};
  for (const field of fields) {
    const next = draft[field].trim();
    if (next !== (value[field] ?? '')) changes[field] = next === '' ? null : next;
  }
  const tooLong = fields.filter((field) => draft[field].trim().length > METADATA_LIMITS[field]);
  const canSave = Object.keys(changes).length > 0 && tooLong.length === 0 && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(changes);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  const set = (field: MetadataField) => (text: string) => setDraft((current) => ({ ...current, [field]: text }));
  return (
    <Form onSubmit={submit} className="mt:flex mt:flex-col mt:gap-3" data-cy={`${idPrefix}-metadata-form`}>
      {fields.map((field) => (
        <TextField
          key={field}
          value={draft[field]}
          onChange={set(field)}
          isInvalid={tooLong.includes(field)}
          className="mt:w-full"
        >
          <Label>{t(`devices.metadata.${field}`)}</Label>
          {field === 'description' ? (
            <TextArea rows={3} data-cy={`${idPrefix}-${field}`} />
          ) : (
            <Input autoComplete="off" data-cy={`${idPrefix}-${field}`} />
          )}
          <Description>{t('devices.metadata.maxLength', { max: METADATA_LIMITS[field] })}</Description>
          {/* HeroUI hides the description while the field is invalid, so the error carries the message. */}
          <FieldError data-cy={`${idPrefix}-${field}-error`}>
            {t('devices.validation.length', { max: METADATA_LIMITS[field] })}
          </FieldError>
        </TextField>
      ))}
      {error && (
        <p className="mt:text-sm mt:text-danger" role="alert" data-cy={`${idPrefix}-metadata-error`}>
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" isDisabled={!canSave} isPending={busy} data-cy={`${idPrefix}-metadata-save`}>
          {t('devices.metadata.save')}
        </Button>
      </div>
    </Form>
  );
}
