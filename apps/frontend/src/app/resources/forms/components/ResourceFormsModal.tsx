import { useEffect, useMemo, useState } from 'react';
import { Button, TextField, FieldError, Input, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Switch, TextArea } from "@heroui/react";
import { Select } from '../../../../components/select';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormFieldType, FormResponseDto, FormSubmissionRequestDto } from '@attraccess/react-query-client';
import {
  ResourceFormAction,
  parseFieldOptions,
  FieldOptions,
  TextFieldOptions,
  NumberFieldOptions,
} from '../../details/forms/types';
import en from '../translations/en.json';
import de from '../translations/de.json';

interface ResourceFormsModalProps {
  isOpen: boolean;
  action: ResourceFormAction;
  forms: FormResponseDto[];
  onSubmit: (payload: FormSubmissionRequestDto[]) => void;
  onCancel: () => void;
}

type FieldValue = string | boolean;

export function ResourceFormsModal({ isOpen, action, forms, onSubmit, onCancel }: ResourceFormsModalProps) {
  const { t } = useTranslations({ en, de });
  const [values, setValues] = useState<Record<number, FieldValue>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (!isOpen) {
      setValues({});
      setErrors({});
      return;
    }

    setValues((prev) => {
      const next = { ...prev };
      forms.forEach((form) => {
        form.fields.forEach((field) => {
          if (field.type === FormFieldType.BOOLEAN) {
            if (typeof next[field.id] !== 'boolean') {
              next[field.id] = false;
            }
          } else if (typeof next[field.id] !== 'string') {
            next[field.id] = '';
          }
        });
      });
      return next;
    });
    setErrors({});
  }, [forms, isOpen]);

  const modalTitle = useMemo(() => {
    switch (action) {
      case 'takeover':
        return t('modal.title.takeover');
      case 'end':
        return t('modal.title.end');
      case 'start':
      default:
        return t('modal.title.start');
    }
  }, [action, t]);

  const handleSubmit = () => {
    const nextErrors: Record<number, string | null> = {};
    try {
      const submissions: FormSubmissionRequestDto[] = forms.map((form) => {
        const answers: FormSubmissionRequestDto['answers'] = [];
        form.fields.forEach((field) => {
          const rawValue = values[field.id];
          const hasValue = fieldHasValue(field.type, rawValue);
          const selectOptions = field.type === FormFieldType.SELECT ? extractSelectOptions(field.options) : undefined;

          // For required boolean fields, the value must be true (checked)
          if (field.type === FormFieldType.BOOLEAN && field.isRequired && rawValue !== true) {
            nextErrors[field.id] = t('modal.booleanRequired');
            throw new Error('VALIDATION_ERROR');
          }

          if (!hasValue) {
            if (field.isRequired) {
              nextErrors[field.id] = t('modal.fieldRequired');
              throw new Error('VALIDATION_ERROR');
            }
            return;
          }

          const normalizedValue = normalizeValue(field.type, rawValue, t, nextErrors, field.id, selectOptions);
          if (normalizedValue === undefined) {
            throw new Error('VALIDATION_ERROR');
          }
          answers.push({ fieldId: field.id, value: normalizedValue });
        });

        return { formId: form.id, answers };
      });

      setErrors({});
      onSubmit(submissions);
    } catch (error) {
      setErrors((prev) => ({ ...prev, ...nextErrors }));
      if ((error as Error).message !== 'VALIDATION_ERROR') {
        console.error(error);
      }
    }
  };

  const handleValueChange = (fieldId: number, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => ({ ...prev, [fieldId]: null }));
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <ModalBackdrop />
      <ModalContainer>
        <ModalDialog>
          {({ close }) => (<>
          <ModalHeader className="flex flex-col gap-1">
            <span>{modalTitle}</span>
            <span className="text-sm text-default-500">{t('modal.description')}</span>
          </ModalHeader>
          <ModalBody>
            {forms.map((form) => (
              <div key={form.id} className="space-y-4 rounded-lg border border-default-200 p-4">
                <p className="font-semibold text-default-600">{t('modal.formHeading', { name: form.name })}</p>
                {form.fields.map((field) => {
                  const rawOptions = field.options as Record<string, unknown> | null | undefined;
                  const parsedOptions = parseFieldOptions(field.type, rawOptions ?? null);
                  const selectOptions =
                    field.type === FormFieldType.SELECT ? extractSelectOptions(field.options) : null;

                  return (
                    <div key={field.id} className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-default-600">
                          {field.name}
                          {field.isRequired && <span className="text-danger-500 ml-1">*</span>}
                        </p>
                        {field.description && <p className="text-xs text-default-400">{field.description}</p>}
                      </div>
                      {renderFieldInput(
                        field,
                        parsedOptions,
                        selectOptions ?? undefined,
                        values[field.id],
                        (value) => handleValueChange(field.id, value),
                        errors[field.id],
                        t,
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={onCancel}>
              {t('modal.cancel')}
            </Button>
            <Button variant="primary" onPress={handleSubmit}>
              {t('modal.submit')}
            </Button>
          </ModalFooter>
          </>)}
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
}

function renderFieldInput(
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
        <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
          <Input />
          {error && <FieldError>{error}</FieldError>}
        </TextField>
      );
  }
}

function fieldHasValue(type: FormFieldType, value: FieldValue | undefined) {
  if (type === FormFieldType.BOOLEAN) {
    return typeof value === 'boolean';
  }
  if (type === FormFieldType.SELECT) {
    return typeof value === 'string' && value.trim().length > 0;
  }
  return Boolean(value && String(value).trim().length > 0);
}

function normalizeValue(
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

function renderTextInput(
  options: TextFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  if (options.multiline) {
    return (
      <TextArea
        value={(value as string) ?? ''}
        placeholder={options.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
    );
  }

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input placeholder={options.placeholder ?? ''} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}

function renderNumberInput(
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

function renderBooleanInput(
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
        <Switch
          isSelected={isChecked}
          onChange={(checked) => onChange(checked)}
          aria-label={t('modal.booleanLabel')}
          className={error ? 'text-danger' : undefined}
        />
        <span className="text-xs text-default-500">{t('modal.booleanYes')}</span>
      </div>
      {error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  );
}

function renderSelectInput(
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
      selectedKey={selectedKey}
      onSelectionChange={(key) => onChange(key ?? '')}
      items={options.map((option) => ({ key: option, label: option }))}
    />
  );
}

function extractSelectOptions(raw: unknown): string[] {
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
