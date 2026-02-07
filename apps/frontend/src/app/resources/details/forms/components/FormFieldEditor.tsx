import { Button, Input, Select, SelectItem, Switch, Textarea } from '@heroui/react';
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
        <Input
          label={t('fields.label')}
          placeholder={t('fields.placeholder.label')}
          value={field.name}
          onChange={(event) => onChange({ ...field, name: event.target.value })}
          isRequired
          ref={labelInputRef as React.Ref<HTMLInputElement> | undefined}
        />

        <Select
          label={t('fields.type')}
          selectedKeys={[field.type]}
          onSelectionChange={(keys) => {
            const [value] = Array.from(keys) as FormFieldType[];
            handleTypeChange(value ?? FormFieldType.TEXT);
          }}
        >
          {FIELD_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value}>{t(option.labelKey)}</SelectItem>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Switch isSelected={field.isRequired} onValueChange={(value) => onChange({ ...field, isRequired: value })}>
          {t('fields.required')}
        </Switch>
        <Button
          size="sm"
          variant="light"
          color="danger"
          startContent={<Trash2 className="w-4 h-4" />}
          onPress={onRemove}
        >
          {t('editor.deleteField')}
        </Button>
      </div>

      <Textarea
        label={t('fields.description')}
        placeholder={t('fields.placeholder.description')}
        value={field.description ?? ''}
        onChange={(event) => onChange({ ...field, description: event.target.value })}
      />

      <FieldOptionsEditor field={field} onChange={onChange} t={t} />
    </div>
  );
}
