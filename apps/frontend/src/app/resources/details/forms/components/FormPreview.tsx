import { Card, CardBody, CardHeader, Input, Select, SelectItem, Switch, Textarea } from '@heroui/react';
import { FormFieldType } from '@attraccess/react-query-client';
import {
  EditableFormField,
  TextFieldOptions,
  NumberFieldOptions,
  SelectFieldOptions,
  BooleanFieldOptions,
} from '../types';

interface FormPreviewProps {
  fields: EditableFormField[];
  t: (key: string) => string;
}

export function FormPreview({ fields, t }: FormPreviewProps) {
  if (!fields.length) {
    return (
      <Card className="h-full">
        <CardHeader>
          <p className="text-sm font-medium text-default-500">{t('preview.empty')}</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <Card key={field.id ?? field.name}>
          <CardHeader className="flex flex-col items-start gap-1 pb-0">
            <p className="text-base font-semibold text-default-700">
              {field.name}
              {field.isRequired && <span className="text-danger-500 ml-1">*</span>}
            </p>
            {field.description && <p className="text-sm text-default-500">{field.description}</p>}
          </CardHeader>
          <CardBody className="pt-2">{renderPreviewField(field, t)}</CardBody>
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
      return renderPreviewSelect(field.options as SelectFieldOptions, t);
    case FormFieldType.BOOLEAN:
      return renderPreviewBoolean(field.options as BooleanFieldOptions, t);
    default:
      return <Input placeholder="…" />;
  }
}

function renderPreviewText(options: TextFieldOptions) {
  if (options.multiline) {
    return <Textarea placeholder={options.placeholder ?? '…'} />;
  }

  return <Input placeholder={options.placeholder ?? '…'} />;
}

function renderPreviewNumber(options: NumberFieldOptions) {
  const min = typeof options.min === 'number' ? options.min : undefined;
  const max = typeof options.max === 'number' ? options.max : undefined;
  const step = typeof options.step === 'number' ? options.step : undefined;

  return <Input type="number" placeholder="0" min={min} max={max} step={step} />;
}

function renderPreviewSelect(options: SelectFieldOptions, t: (key: string) => string) {
  const items = options.options ?? [];
  return (
    <Select placeholder={t('preview.selectPlaceholder')}>
      {items.map((option) => (
        <SelectItem key={option}>{option}</SelectItem>
      ))}
    </Select>
  );
}

function renderPreviewBoolean(options: BooleanFieldOptions, t: (key: string) => string) {
  const yesLabel = options.trueLabel?.trim() || t('preview.booleanYes');
  const noLabel = options.falseLabel?.trim() || t('preview.booleanNo');

  return (
    <div className="flex items-center gap-3">
      <Switch defaultSelected>{yesLabel}</Switch>
      <Switch>{noLabel}</Switch>
    </div>
  );
}
