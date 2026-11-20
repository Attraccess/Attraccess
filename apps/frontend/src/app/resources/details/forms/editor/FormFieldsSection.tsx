import { Accordion } from '@heroui/react';
import type { Selection } from '@heroui/react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormFieldType } from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditableFormField, createDefaultFieldOptions } from '../types';
import en from '../en.json';
import de from '../de.json';
import { SortableField } from './SortableField';

interface FormFieldsSectionProps {
  fields: EditableFormField[];
  onFieldsChange: (update: (fields: EditableFormField[]) => EditableFormField[]) => void;
}

const fieldKey = (field: EditableFormField) => field._id ?? `field-${field.id}`;

/** The sortable list of form fields; owns which field is expanded and focuses the label of a newly added field. */
export function FormFieldsSection({ fields, onFieldsChange }: Readonly<FormFieldsSectionProps>) {
  const { t } = useTranslations({ en, de });
  const [expandedFieldKeys, setExpandedFieldKeys] = useState<Selection>(new Set<string>());
  const lastLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [fieldAdded, setFieldAdded] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const addField = () => {
    const temporaryId = Date.now().toString();
    onFieldsChange((prev) => [
      ...prev,
      {
        name: '',
        _id: temporaryId,
        type: FormFieldType.TEXT,
        isRequired: true,
        description: '',
        options: createDefaultFieldOptions(FormFieldType.TEXT),
      },
    ]);
    setExpandedFieldKeys(new Set([`field-${temporaryId}`]));
    setFieldAdded(true);
  };

  useEffect(() => {
    if (fieldAdded && lastLabelInputRef.current) {
      lastLabelInputRef.current.focus();
      setFieldAdded(false);
    }
  }, [fieldAdded]);

  const updateField = (index: number, field: EditableFormField) => {
    onFieldsChange((prev) => {
      const nextFields = [...prev];
      nextFields[index] = field;
      return nextFields;
    });
  };

  const removeField = (index: number) => {
    onFieldsChange((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      onFieldsChange((prev) => {
        const oldIndex = prev.findIndex((f) => fieldKey(f) === active.id);
        const newIndex = prev.findIndex((f) => fieldKey(f) === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [onFieldsChange],
  );

  const fieldSortableIds = useMemo(() => fields.map(fieldKey), [fields]);

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('editor.sections.fields')}
        </h3>
        <Button variant="secondary" onPress={addField} data-cy="form-editor-add-field-button">
          {t('editor.addField')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-default-200 p-6 text-center">
          <p className="font-medium text-default-600">{t('editor.emptyFieldsTitle')}</p>
          <p className="text-sm text-default-400">{t('editor.emptyFieldsDescription')}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fieldSortableIds} strategy={verticalListSortingStrategy}>
            <Accordion variant="surface" expandedKeys={expandedFieldKeys} onExpandedChange={setExpandedFieldKeys}>
              {fields.map((field, index) => (
                <SortableField
                  key={fieldKey(field)}
                  field={field}
                  index={index}
                  onChange={(value) => updateField(index, value)}
                  onRemove={() => removeField(index)}
                  labelInputRef={index === fields.length - 1 ? lastLabelInputRef : undefined}
                />
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
