import { Card, Input, TextArea } from "@heroui/react";
import { Select } from '../../../../../components/select';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { FormFieldType } from '@attraccess/react-query-client';
import { EditableFormField, TextFieldOptions, NumberFieldOptions, SelectFieldOptions } from '../types';

interface FormPreviewProps {
  fields: EditableFormField[];
  t: (key: string) => string;
}

export function FormPreview({ fields, t }: FormPreviewProps) {
  if (!fields.length) {
    return (
      <Card className="h-full">
        <Card.Header>
          <p className="text-sm font-medium text-default-500">{t('preview.empty')}</p>
        </Card.Header>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <Card key={field.id ?? field.name}>
          <Card.Header className="flex flex-col items-start gap-1 pb-0">
            <p className="text-base font-semibold text-default-700">
              {field.name}
              {field.isRequired && <span className="text-danger-500 ml-1">*</span>}
            </p>
            {field.description && <p className="text-sm text-default-500">{field.description}</p>}
          </Card.Header>
          <Card.Content className="pt-2">{renderPreviewField(field, t)}</Card.Content>
        </Card>
      ))}
    </div>
  );
}

function renderPreviewField(field: EditableFormField, t: (key: string) => string) {
  switch (field.type) {
    case FormFieldType.TEXT:
      return renderPreviewText(field.options as TextFieldOptions);
    case FormFieldType.NUMBER:
      return renderPreviewNumber(field.options as NumberFieldOptions);
    case FormFieldType.SELECT:
      return renderPreviewSelect(field.options as SelectFieldOptions, t, field.name);
    case FormFieldType.BOOLEAN:
      return renderPreviewBoolean(t);
    default:
      return <Input placeholder="…" />;
  }
}

function renderPreviewText(options: TextFieldOptions) {
  if (options.multiline) {
    return <TextArea placeholder={options.placeholder ?? '…'} />;
  }

  return <Input placeholder={options.placeholder ?? '…'} />;
}

function renderPreviewNumber(options: NumberFieldOptions) {
  const min = typeof options.min === 'number' ? options.min : undefined;
  const max = typeof options.max === 'number' ? options.max : undefined;
  const step = typeof options.step === 'number' ? options.step : undefined;

  return <Input type="number" placeholder="0" min={min} max={max} step={step} />;
}

function renderPreviewSelect(options: SelectFieldOptions, t: (key: string) => string, fieldName: string) {
  const items = options.options ?? [];
  return (
    <Select
      placeholder={t('preview.selectPlaceholder')}
      aria-label={fieldName}
      items={items.map((option) => ({ key: option, label: option }))}
    />
  );
}

function renderPreviewBoolean(t: (key: string) => string) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-default-500">{t('preview.booleanNo')}</span>
      <LabeledSwitch aria-label={t('preview.booleanLabel')} />
      <span className="text-xs text-default-500">{t('preview.booleanYes')}</span>
    </div>
  );
}
