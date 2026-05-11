import { Button, TextField, Label, Input, Switch, TextArea } from "@heroui/react";
import { Select } from '../../../../../components/select';
import { Trash2 } from 'lucide-react';
import { FormFieldType } from '@attraccess/react-query-client';
import { EditableFormField, createDefaultFieldOptions } from '../types';
import { FieldOptionsEditor } from './FieldOptionsEditor';

interface FormFieldEditorProps {
  field: EditableFormField;
  onChange: (field: EditableFormField) => void;
  onRemove: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  labelInputRef?: React.RefObject<HTMLInputElement | null>;
}

const FIELD_TYPE_OPTIONS: { value: FormFieldType; labelKey: string }[] = [
  { value: FormFieldType.TEXT, labelKey: 'fields.types.text' },
  { value: FormFieldType.NUMBER, labelKey: 'fields.types.number' },
  { value: FormFieldType.SELECT, labelKey: 'fields.types.select' },
  { value: FormFieldType.BOOLEAN, labelKey: 'fields.types.boolean' },
];

export function FormFieldEditor(props: FormFieldEditorProps) {
  const { field, onChange, onRemove, t, labelInputRef } = props;

  const handleTypeChange = (nextType: FormFieldType | undefined) => {
    if (!nextType) {
      return;
    }
    onChange({
      ...field,
      type: nextType,
      options: createDefaultFieldOptions(nextType),
    });
  };

  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField isRequired value={field.name} onChange={(v) => onChange({ ...field, name: v })}>
          <Label>{t('fields.label')}</Label>
          <Input placeholder={t('fields.placeholder.label')} ref={labelInputRef as React.Ref<HTMLInputElement> | undefined} />
        </TextField>

        <Select
          label={t('fields.type')}
          selectedKey={field.type}
          onSelectionChange={(key) => {
            handleTypeChange((key as FormFieldType) ?? FormFieldType.TEXT);
          }}
          items={FIELD_TYPE_OPTIONS.map((option) => ({ key: option.value, label: t(option.labelKey) }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Switch isSelected={field.isRequired} onChange={(value) => onChange({ ...field, isRequired: value })}>
          {t('fields.required')}
        </Switch>
        <Button variant="danger-soft"

          onPress={onRemove}
        ><Trash2 className="w-4 h-4" />
          {t('editor.deleteField')}
        </Button>
      </div>

      <TextArea
       
        placeholder={t('fields.placeholder.description')}
        value={field.description ?? ''}
        onChange={(event) => onChange({ ...field, description: event.target.value })}
      />

      <FieldOptionsEditor field={field} onChange={onChange} t={t} />
    </div>
  );
}
