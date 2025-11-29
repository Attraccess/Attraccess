import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch, Textarea } from '@heroui/react';
import type { ComponentType } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  FormFieldType,
  FormResponseDto,
  FormSubmissionRequestDto,
} from '@attraccess/react-query-client';
import { ResourceFormAction, parseFieldOptions, FieldOptions, TextFieldOptions, NumberFieldOptions, DatetimeFieldOptions, BooleanFieldOptions } from '../../details/forms/types';
import { DateValue, getLocalTimeZone, parseAbsoluteToLocal } from '@internationalized/date';
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

// HeroUI bundles its own @internationalized/date types, so we cast to loosen props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyDatePicker = DatePicker as unknown as ComponentType<any>;

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

          if (!hasValue) {
            if (field.isRequired) {
              nextErrors[field.id] = t('modal.fieldRequired');
              throw new Error('VALIDATION_ERROR');
            }
            return;
          }

          const normalizedValue = normalizeValue(field.type, rawValue, t, nextErrors, field.id);
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
    <Modal isOpen={isOpen} onClose={onCancel} size="lg" scrollBehavior="inside">
      <ModalContent>
        <>
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

                  return (
                    <div key={field.id} className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-default-600">
                          {field.name}
                          {field.isRequired && <span className="text-danger-500 ml-1">*</span>}
                        </p>
                        {field.description && (
                          <p className="text-xs text-default-400">{field.description}</p>
                        )}
                      </div>
                      {renderFieldInput(
                        field,
                        parsedOptions,
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
            <Button variant="light" onPress={onCancel}>
              {t('modal.cancel')}
            </Button>
            <Button color="primary" onPress={handleSubmit}>
              {t('modal.submit')}
            </Button>
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  );
}

function renderFieldInput(
  field: FormResponseDto['fields'][number],
  options: FieldOptions,
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
    case FormFieldType.DATETIME:
      return renderDatetimeInput(options as DatetimeFieldOptions, value, onChange, error);
    case FormFieldType.BOOLEAN:
      return renderBooleanInput(options as BooleanFieldOptions, value, onChange, t);
    default:
      return (
        <Input
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          isInvalid={Boolean(error)}
          errorMessage={error ?? undefined}
        />
      );
  }
}

function fieldHasValue(type: FormFieldType, value: FieldValue | undefined) {
  if (type === FormFieldType.BOOLEAN) {
    return typeof value === 'boolean';
  }
  return Boolean(value && String(value).trim().length > 0);
}

function normalizeValue(
  type: FormFieldType,
  rawValue: FieldValue | undefined,
  t: (key: string) => string,
  errors: Record<number, string | null>,
  fieldId: number,
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
    case FormFieldType.DATETIME: {
      const value = String(rawValue);
      if (Number.isNaN(new Date(value).getTime())) {
        errors[fieldId] = t('modal.datetimeInvalid');
        return undefined;
      }
      return value;
    }
    case FormFieldType.BOOLEAN:
      return Boolean(rawValue);
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
      <Textarea
        value={(value as string) ?? ''}
        placeholder={options.placeholder ?? ''}
        onChange={(event) => onChange(event.target.value)}
        isInvalid={Boolean(error)}
        errorMessage={error ?? undefined}
      />
    );
  }

  return (
    <Input
      value={(value as string) ?? ''}
      placeholder={options.placeholder ?? ''}
      onChange={(event) => onChange(event.target.value)}
      isInvalid={Boolean(error)}
      errorMessage={error ?? undefined}
    />
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
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={(value as string) ?? ''}
      onChange={(event) => onChange(event.target.value)}
      isInvalid={Boolean(error)}
      errorMessage={error ?? undefined}
    />
  );
}

function renderDatetimeInput(
  options: DatetimeFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  return (
    <AnyDatePicker
      labelPlacement="outside"
      granularity="minute"
      value={isoToZonedDateTime(value as string) as unknown as DateValue}
      minValue={isoToZonedDateTime(options.earliest) as unknown as DateValue}
      maxValue={isoToZonedDateTime(options.latest) as unknown as DateValue}
      onChange={(date: DateValue | null) => onChange(dateValueToIso(date) ?? '')}
      isInvalid={Boolean(error)}
      errorMessage={error ?? undefined}
    />
  );
}

const isoToZonedDateTime = (value?: string): DateValue | null => {
  if (!value) {
    return null;
  }
  try {
    return parseAbsoluteToLocal(value) as DateValue;
  } catch {
    return null;
  }
};

const dateValueToIso = (value?: DateValue | null) => {
  if (!value) {
    return undefined;
  }
  return value.toDate(getLocalTimeZone()).toISOString();
};

function renderBooleanInput(
  options: BooleanFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  t: (key: string) => string,
) {
  const trueLabel = options.trueLabel?.trim() || t('modal.booleanYes');
  const falseLabel = options.falseLabel?.trim() || t('modal.booleanNo');

  return (
    <div className="space-y-2">
      <Switch isSelected={(value as boolean) ?? false} onValueChange={(checked) => onChange(checked)}>
        {trueLabel}
      </Switch>
      <p className="text-xs text-default-400">{falseLabel}</p>
    </div>
  );
}

