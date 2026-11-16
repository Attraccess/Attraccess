import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import {
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { EditableFormField } from '../types';
import { FormFieldEditor } from '../components/FormFieldEditor';
import en from '../en.json';
import de from '../de.json';

interface SortableFieldProps {
  field: EditableFormField;
  index: number;
  onChange: (field: EditableFormField) => void;
  onRemove: () => void;
  labelInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SortableField({ field, index, onChange, onRemove, labelInputRef }: Readonly<SortableFieldProps>) {
  const { t } = useTranslations({ en, de });
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
