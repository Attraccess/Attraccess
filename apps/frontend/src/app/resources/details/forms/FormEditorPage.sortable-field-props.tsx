import { EditableFormField } from './types';

export interface SortableFieldProps {
  field: EditableFormField;
  index: number;
  onChange: (field: EditableFormField) => void;
  onRemove: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  labelInputRef?: React.RefObject<HTMLInputElement | null>;
}
