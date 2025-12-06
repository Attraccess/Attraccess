import { Button, Input, Switch } from '@heroui/react';
import { Plus, X } from 'lucide-react';
import { FormFieldType } from '@attraccess/react-query-client';
import { EditableFormField, TextFieldOptions, NumberFieldOptions, SelectFieldOptions } from '../types';
import { useEffect, useRef, useState } from 'react';

interface FieldOptionsEditorProps {
  field: EditableFormField;
  onChange: (field: EditableFormField) => void;
  t: (key: string) => string;
}

export function FieldOptionsEditor({ field, onChange, t }: FieldOptionsEditorProps) {
  const updateOptions = (nextOptions: typeof field.options) => {
    onChange({ ...field, options: { ...field.options, ...nextOptions } });
  };

  const lastOptionInputRef = useRef<HTMLInputElement>(null);
  const [optionAdded, setOptionAdded] = useState(false);

  useEffect(() => {
    if (optionAdded && lastOptionInputRef.current) {
      lastOptionInputRef.current.focus();
      setOptionAdded(false);
    }
  }, [optionAdded]);

  return (
    <div className="rounded-lg border border-default-200 dark:border-default-100 p-4 space-y-3">
      <p className="text-sm font-semibold text-default-600">{t('fields.optionsTitle')}</p>
      {renderOptionsByType(field.type, field.options, updateOptions, t, lastOptionInputRef, setOptionAdded)}
    </div>
  );
}

function renderOptionsByType(
  type: FormFieldType,
  options: EditableFormField['options'],
  updateOptions: (options: EditableFormField['options']) => void,
  t: (key: string) => string,
  lastOptionInputRef: React.RefObject<HTMLInputElement>,
  setOptionAdded: (value: boolean) => void,
) {
  switch (type) {
    case FormFieldType.TEXT: {
      const textOptions = options as TextFieldOptions;
      return (
        <div className="space-y-3">
          <Input
            label={t('fields.options.text.placeholder')}
            value={textOptions.placeholder ?? ''}
            onChange={(event) => updateOptions({ placeholder: event.target.value })}
          />
          <Switch
            isSelected={Boolean(textOptions.multiline)}
            onValueChange={(value) => updateOptions({ multiline: value })}
          >
            {t('fields.options.text.multiline')}
          </Switch>
        </div>
      );
    }
    case FormFieldType.NUMBER: {
      const numberOptions = options as NumberFieldOptions;
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label={t('fields.options.number.min')}
            type="number"
            value={numberOptions.min === '' || numberOptions.min === undefined ? '' : String(numberOptions.min)}
            onChange={(event) => updateOptions({ min: event.target.value === '' ? '' : Number(event.target.value) })}
          />
          <Input
            label={t('fields.options.number.max')}
            type="number"
            value={numberOptions.max === '' || numberOptions.max === undefined ? '' : String(numberOptions.max)}
            onChange={(event) => updateOptions({ max: event.target.value === '' ? '' : Number(event.target.value) })}
          />
          <Input
            label={t('fields.options.number.step')}
            type="number"
            value={numberOptions.step === '' || numberOptions.step === undefined ? '' : String(numberOptions.step)}
            onChange={(event) => updateOptions({ step: event.target.value === '' ? '' : Number(event.target.value) })}
          />
        </div>
      );
    }
    case FormFieldType.SELECT: {
      const selectOptions = options as SelectFieldOptions;
      const currentOptions = selectOptions.options ?? [];

      const handleAddOption = () => {
        updateOptions({ options: [...currentOptions, ''] });
        setOptionAdded(true);
      };

      const handleRemoveOption = (index: number) => {
        updateOptions({ options: currentOptions.filter((_, i) => i !== index) });
      };

      const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...currentOptions];
        newOptions[index] = value;
        updateOptions({ options: newOptions });
      };

      return (
        <div className="space-y-3">
          <p className="text-xs text-default-500">{t('fields.options.select.description')}</p>
          {currentOptions.map((option, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                value={option}
                placeholder={t('fields.options.select.optionPlaceholder')}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                size="sm"
                ref={index === currentOptions.length - 1 ? lastOptionInputRef : undefined}
              />
              <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => handleRemoveOption(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus className="w-4 h-4" />}
            onPress={handleAddOption}
            isDisabled={currentOptions.length >= 12}
          >
            {currentOptions.length >= 12 ? t('fields.options.select.maxOptions') : t('fields.options.select.addOption')}
          </Button>
        </div>
      );
    }
    case FormFieldType.BOOLEAN:
      return <p className="text-sm text-default-500">{t('fields.options.boolean.description')}</p>;
    default:
      return null;
  }
}
