import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  TextField,
  FieldError,
  Input,
  TextArea,
} from '@heroui/react';
import { formImageLimit, parseFormImageIds } from '@attraccess/application-models';
import { LabeledSwitch, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormFieldType, FormSubmissionRequestDto, FormResponseDto } from '@attraccess/react-query-client';
import {
  parseFieldOptions,
  ResourceFormAction,
  FieldOptions,
  TextFieldOptions,
  NumberFieldOptions,
} from '../../../forms/types';
import en from '../translations/en.json';
import de from '../translations/de.json';
import { Select } from '../../../../components/select/index';
import { ImageFieldInput } from '../../../forms/images/ImageFieldInput';

export interface ResourceFormsModalProps {
  isOpen: boolean;
  /** The resource the forms are filled in for: image uploads belong to it. */
  resourceId: number;
  action: ResourceFormAction;
  forms: FormResponseDto[];
  initialSubmissions?: FormSubmissionRequestDto[];
  onSubmit: (payload: FormSubmissionRequestDto[]) => void;
  onCancel: () => void;
}

export function extractSelectOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const unique = new Set<string>();
  const result: string[] = [];
  raw.forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

/** An image field's value is the list of its image ids. */
export type FieldValue = string | boolean | string[];

export function fieldHasValue(type: FormFieldType, value: FieldValue | undefined) {
  if (type === FormFieldType.IMAGE) {
    return Array.isArray(value) && value.length > 0;
  }
  if (type === FormFieldType.BOOLEAN) {
    return typeof value === 'boolean';
  }
  if (type === FormFieldType.SELECT) {
    return typeof value === 'string' && value.trim().length > 0;
  }
  return Boolean(value && String(value).trim().length > 0);
}

export function normalizeValue(
  type: FormFieldType,
  rawValue: FieldValue | undefined,
  t: (key: string) => string,
  errors: Record<number, string | null>,
  fieldId: number,
  selectOptions?: string[],
) {
  switch (type) {
    case FormFieldType.TEXT:
      return String(rawValue);
    case FormFieldType.IMAGE:
      return Array.isArray(rawValue) ? rawValue : [];
    case FormFieldType.NUMBER: {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        errors[fieldId] = t('modal.numberInvalid');
        return undefined;
      }
      return numericValue;
    }
    case FormFieldType.BOOLEAN:
      return Boolean(rawValue);
    case FormFieldType.SELECT: {
      const value = typeof rawValue === 'string' ? rawValue : '';
      if (!selectOptions?.length) {
        errors[fieldId] = t('modal.selectUnavailable');
        return undefined;
      }
      if (!selectOptions.includes(value)) {
        errors[fieldId] = t('modal.selectInvalid');
        return undefined;
      }
      return value;
    }
    default:
      return rawValue ?? '';
  }
}

export function renderTextInput(
  options: TextFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  if (options.multiline) {
    return (
      <div className="space-y-1">
        <TextArea
          value={(value as string) ?? ''}
          placeholder={options.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p className="flex items-start gap-1 text-sm font-medium text-danger">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input placeholder={options.placeholder ?? ''} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}

export function renderNumberInput(
  options: NumberFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  const min = typeof options.min === 'number' ? options.min : undefined;
  const max = typeof options.max === 'number' ? options.max : undefined;
  const step = typeof options.step === 'number' ? options.step : undefined;

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input type="number" min={min} max={max} step={step} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}

export function renderBooleanInput(
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
) {
  const isChecked = value === true;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-default-500">{t('modal.booleanNo')}</span>
        <LabeledSwitch
          isSelected={isChecked}
          onChange={(checked) => onChange(checked)}
          aria-label={t('modal.booleanLabel')}
          className={error ? 'text-danger' : undefined}
        />
        <span className="text-xs text-default-500">{t('modal.booleanYes')}</span>
      </div>
      {error && (
        <p className="flex items-start gap-1 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function renderSelectInput(
  options: string[],
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
  fieldName: string,
) {
  const selectedKey = typeof value === 'string' && options.includes(value) ? value : '';

  return (
    <Select
      placeholder={options.length ? t('modal.selectPlaceholder') : t('modal.selectUnavailable')}
      isDisabled={!options.length}
      aria-label={fieldName}
      value={selectedKey}
      onChange={(key) => onChange(key ?? '')}
      items={options.map((option) => ({ key: option, label: option }))}
    />
  );
}

export function renderFieldInput(
  field: FormResponseDto['fields'][number],
  options: FieldOptions,
  selectOptions: string[] | undefined,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
) {
  switch (field.type) {
    case FormFieldType.TEXT:
      return renderTextInput(options as TextFieldOptions, value, onChange, error);
    case FormFieldType.NUMBER:
      return renderNumberInput(options as NumberFieldOptions, value, onChange, error);
    case FormFieldType.BOOLEAN:
      return renderBooleanInput(value, onChange, error, t);
    case FormFieldType.SELECT:
      return renderSelectInput(selectOptions ?? [], value, onChange, error, t, field.name);
    default:
      return (
        <TextField
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          isInvalid={Boolean(error)}
        >
          <Input />
          {error && <FieldError>{error}</FieldError>}
        </TextField>
      );
  }
}

export function ResourceFormsModal({
  isOpen,
  resourceId,
  action,
  forms,
  initialSubmissions,
  onSubmit,
  onCancel,
}: ResourceFormsModalProps) {
  // React escapes the output; escaping form and field names again would show "A &amp; B".
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const [values, setValues] = useState<Record<number, FieldValue>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  /** The image fields with an upload running: submitting then would leave the photo out. */
  const [uploading, setUploading] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setValues({});
      setErrors({});
      setUploading(new Set());
      return;
    }

    setValues((prev) => {
      const next = { ...prev };
      initialSubmissions?.forEach((submission) => {
        const form = forms.find(({ id }) => id === submission.formId);
        submission.answers.forEach(({ fieldId, value }) => {
          if (form?.fields.some(({ id }) => id === fieldId)) {
            const type = form.fields.find(({ id }) => id === fieldId)?.type;
            if (type === FormFieldType.IMAGE) next[fieldId] = parseFormImageIds(value);
            else next[fieldId] = typeof value === 'boolean' ? value : String(value);
          }
        });
      });
      forms.forEach((form) => {
        form.fields.forEach((field) => {
          if (field.type === FormFieldType.BOOLEAN) {
            if (typeof next[field.id] !== 'boolean') {
              next[field.id] = false;
            }
          } else if (field.type === FormFieldType.IMAGE) {
            if (!Array.isArray(next[field.id])) next[field.id] = [];
          } else if (typeof next[field.id] !== 'string') {
            next[field.id] = '';
          }
        });
      });
      return next;
    });
    setErrors({});
  }, [forms, isOpen, initialSubmissions]);

  const modalTitle = useMemo(() => {
    switch (action) {
      case 'takeover':
        return t('modal.title.takeover');
      case 'end':
        return t('modal.title.end');
      case 'project-switch':
        return t('modal.title.projectSwitch');
      case 'project-reassign':
        return t('modal.title.projectReassign');
      case 'start':
      default:
        return t('modal.title.start');
    }
  }, [action, t]);

  /** Checks every field so all problems show at once, and scrolls to the first one: with several forms it is out of view. */
  const handleSubmit = () => {
    if (uploading.size > 0) return;
    const nextErrors: Record<number, string | null> = {};
    let firstInvalidFieldId: number | null = null;
    const fail = (fieldId: number, message?: string) => {
      if (message) nextErrors[fieldId] = message;
      firstInvalidFieldId ??= fieldId;
    };

    const submissions: FormSubmissionRequestDto[] = forms.map((form) => {
      const answers: FormSubmissionRequestDto['answers'] = [];
      form.fields.forEach((field) => {
        const rawValue = values[field.id];
        const selectOptions = field.type === FormFieldType.SELECT ? extractSelectOptions(field.options) : undefined;

        // For required boolean fields, the value must be true (checked)
        if (field.type === FormFieldType.BOOLEAN && field.isRequired && rawValue !== true) {
          fail(field.id, t('modal.booleanRequired'));
          return;
        }

        if (!fieldHasValue(field.type, rawValue)) {
          if (field.isRequired) fail(field.id, t('modal.fieldRequired'));
          return;
        }

        if (field.type === FormFieldType.IMAGE && (rawValue as string[]).length > formImageLimit(field.options)) {
          fail(field.id, t('modal.imageTooMany', { count: formImageLimit(field.options) }));
          return;
        }

        const normalizedValue = normalizeValue(field.type, rawValue, t, nextErrors, field.id, selectOptions);
        if (normalizedValue === undefined) {
          fail(field.id);
          return;
        }
        answers.push({ fieldId: field.id, value: normalizedValue });
      });

      return { formId: form.id, answers };
    });

    if (firstInvalidFieldId !== null) {
      setErrors(nextErrors);
      const fieldId = firstInvalidFieldId;
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-form-field-id="${fieldId}"]`)
          ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
      );
      return;
    }

    setErrors({});
    onSubmit(submissions);
  };

  const handleValueChange = (fieldId: number, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => ({ ...prev, [fieldId]: null }));
    }
  };

  const handleImagesChange = (fieldId: number, update: (ids: string[]) => string[]) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: update(Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : []),
    }));
    setErrors((prev) => (prev[fieldId] ? { ...prev, [fieldId]: null } : prev));
  };

  const handleUploadingChange = (fieldId: number, busy: boolean) =>
    setUploading((prev) => {
      if (prev.has(fieldId) === busy) return prev;
      const next = new Set(prev);
      if (busy) next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DrawerHeader className="flex flex-col gap-1">
        <DrawerHeading>{modalTitle}</DrawerHeading>
        <span className="text-sm text-default-500">{t('modal.description')}</span>
      </DrawerHeader>
      <DrawerBody>
        {forms.map((form) => (
          <div key={form.id} className="space-y-4 rounded-lg border border-default-200 p-4">
            <p className="font-semibold text-default-600">{t('modal.formHeading', { name: form.name })}</p>
            {form.fields.map((field) => {
              const rawOptions = field.options as Record<string, unknown> | null | undefined;
              const parsedOptions = parseFieldOptions(field.type, rawOptions ?? null);
              const selectOptions = field.type === FormFieldType.SELECT ? extractSelectOptions(field.options) : null;

              return (
                <div key={field.id} className="space-y-2" data-form-field-id={field.id}>
                  <div>
                    <p className="text-sm font-medium text-default-600">
                      {field.name}
                      {field.isRequired && <span className="text-danger-500 ml-1">*</span>}
                    </p>
                    {field.description && <p className="text-xs text-default-400">{field.description}</p>}
                  </div>
                  {field.type === FormFieldType.IMAGE ? (
                    <ImageFieldInput
                      resourceId={resourceId}
                      action={action}
                      formId={form.id}
                      fieldId={field.id}
                      fieldName={field.name}
                      maxImages={formImageLimit(field.options)}
                      ids={Array.isArray(values[field.id]) ? (values[field.id] as string[]) : []}
                      onChange={(update) => handleImagesChange(field.id, update)}
                      onBusyChange={(busy) => handleUploadingChange(field.id, busy)}
                      error={errors[field.id]}
                    />
                  ) : (
                    renderFieldInput(
                      field,
                      parsedOptions,
                      selectOptions ?? undefined,
                      values[field.id],
                      (value) => handleValueChange(field.id, value),
                      errors[field.id],
                      t,
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </DrawerBody>
      <DrawerFooter>
        <Button variant="ghost" onPress={onCancel}>
          {t('modal.cancel')}
        </Button>
        <Button variant="primary" onPress={handleSubmit} isDisabled={uploading.size > 0}>
          {t('modal.submit')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
