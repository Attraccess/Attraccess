import { EditableForm } from './types';
import { serializeFieldOptions } from './types';
import { UseResourceFormsServiceResourceFormsGetOneKeyFn } from '@attraccess/react-query-client';
import { UseResourceFormsServiceResourceFormsListKeyFn } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { AccordionBody } from '@heroui/react';
import { AccordionHeading } from '@heroui/react';
import { AccordionIndicator } from '@heroui/react';
import { AccordionItem } from '@heroui/react';
import { AccordionPanel } from '@heroui/react';
import { AccordionTrigger } from '@heroui/react';
import { FormFieldEditor } from './components/FormFieldEditor';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { SortableFieldProps } from './FormEditorPage.sortable-field-props';

export function buildRequestBody(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    fields: form.fields.map((field, index) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || undefined,
      options: serializeFieldOptions(field.type, field.options) ?? undefined,
      position: index,
    })),
  };
}

export async function invalidateFormQueries(
  resourceId: number,
  queryClient: ReturnType<typeof useQueryClient>,
  formId?: number,
) {
  await queryClient.invalidateQueries({
    queryKey: UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }),
  });
  if (formId) {
    await queryClient.invalidateQueries({
      queryKey: UseResourceFormsServiceResourceFormsGetOneKeyFn({ resourceId, formId }),
    });
  }
}

export function sanitizeFormPayload(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    fields: form.fields.map((field, index) => ({
      id: field.id ?? null,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || '',
      options: serializeFieldOptions(field.type, field.options),
      position: index,
    })),
  };
}

export function SortableField({ field, index, onChange, onRemove, t, labelInputRef }: SortableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field._id ?? `field-${field.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const key = `field-${field.id ?? field._id}`;
  const typeLabel = t(`fields.types.${field.type}`);

  return (
    <div ref={setNodeRef} style={style}>
      <AccordionItem key={key} id={key} aria-label={`${t('fields.label')} #${index + 1}`}>
        <AccordionHeading>
          {/* No onPress here: the Accordion already toggles via onExpandedChange, and a
              second handler would toggle straight back, making clicks a no-op. */}
          <AccordionTrigger>
            <div className="flex items-center gap-2 flex-1">
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-default-100 touch-none"
                {...attributes}
                {...listeners}
                // The trigger's press handling works off pointer events that bubble up from
                // this nested button — without stopPropagation, grabbing the grip also
                // toggles the panel.
                onPointerDown={(e) => {
                  e.stopPropagation();
                  listeners?.onPointerDown?.(e);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('editor.reorderField')}
              >
                <GripVertical className="w-4 h-4 text-default-400" />
              </button>
              <div className="flex flex-col text-start flex-1">
                <span className="text-sm font-semibold text-default-700">
                  <i className="font-thin">#{index + 1}</i> {field.name || t('fields.placeholder.label')}
                </span>
                <span className="text-xs text-default-400">{typeLabel}</span>
              </div>
            </div>
            <AccordionIndicator />
          </AccordionTrigger>
        </AccordionHeading>
        <AccordionPanel>
          <AccordionBody>
            <FormFieldEditor
              field={field}
              onChange={onChange}
              onRemove={onRemove}
              t={t}
              labelInputRef={labelInputRef}
            />
          </AccordionBody>
        </AccordionPanel>
      </AccordionItem>
    </div>
  );
}
