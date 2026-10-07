import { useEffect, useMemo, useState } from 'react';
import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { StandardDrawer } from '../../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormFieldType, FormSubmissionRequestDto } from '@attraccess/react-query-client';
import { parseFieldOptions } from '../../details/forms/types';
import en from '../translations/en.json';
import de from '../translations/de.json';
import { ResourceFormsModalProps } from './ResourceFormsModal.resource-forms-modal-props';
import { FieldValue } from './ResourceFormsModal.field-value';
import { fieldHasValue } from './ResourceFormsModal.field-has-value';
import { extractSelectOptions } from './ResourceFormsModal.extract-select-options';
import { normalizeValue } from './ResourceFormsModal.normalize-value';
import { renderFieldInput } from './ResourceFormsModal.render-field-input';

export function ResourceFormsModal({
  isOpen,
  action,
  forms,
  initialSubmissions,
  onSubmit,
  onCancel,
}: ResourceFormsModalProps) {
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
      initialSubmissions?.forEach((submission) => {
        const form = forms.find(({ id }) => id === submission.formId);
        submission.answers.forEach(({ fieldId, value }) => {
          if (form?.fields.some(({ id }) => id === fieldId)) {
            next[fieldId] = typeof value === 'boolean' ? value : String(value);
          }
        });
      });
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
  }, [forms, isOpen, initialSubmissions]);

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
      </DrawerBody>
      <DrawerFooter>
        <Button variant="ghost" onPress={onCancel}>
          {t('modal.cancel')}
        </Button>
        <Button variant="primary" onPress={handleSubmit}>
          {t('modal.submit')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
