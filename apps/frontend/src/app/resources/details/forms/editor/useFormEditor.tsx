import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, useSortable } from '@dnd-kit/sortable';
import {
  EditableForm,
  EditableFormField,
  parseFieldFromResponse,
  createDefaultFieldOptions,
  serializeFieldOptions,
} from '../types';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  FormFieldType,
  useResourceFormsServiceResourceFormsCreate,
  useResourceFormsServiceResourceFormsDelete,
  useResourceFormsServiceResourceFormsGetOne,
  useResourceFormsServiceResourceFormsUpdate,
  useResourcesServiceGetOneResourceById,
  UseResourceFormsServiceResourceFormsGetOneKeyFn,
  UseResourceFormsServiceResourceFormsListKeyFn,
} from '@attraccess/react-query-client';
import {
  Selection,
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@heroui/react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from '../en.json';
import de from '../de.json';
import { FormFieldEditor } from '../components/FormFieldEditor';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export const EMPTY_FORM: EditableForm = {
  name: '',
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [],
};

export interface SortableFieldProps {
  field: EditableFormField;
  index: number;
  onChange: (field: EditableFormField) => void;
  onRemove: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  labelInputRef?: React.RefObject<HTMLInputElement | null>;
}

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

export function useFormEditorPageStateInputs() {
  const { id, formId } = useParams<{ id: string; formId: string }>();
  const resourceId = Number(id);
  const isCreateMode = !formId || formId === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t, tExists } = useTranslations({ en, de });

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const { data: formResponse, isLoading: isLoadingForm } = useResourceFormsServiceResourceFormsGetOne(
    { resourceId, formId: Number(formId) },
    undefined,
    { enabled: !isCreateMode && Number.isFinite(resourceId) },
  );

  const [form, setForm] = useState<EditableForm>({ ...EMPTY_FORM, fields: [] });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [expandedFieldKeys, setExpandedFieldKeys] = useState<Selection>(new Set<string>());

  useEffect(() => {
    if (formResponse) {
      setForm({
        name: formResponse.name,
        isRequiredOnResourceUsageStart: formResponse.isRequiredOnResourceUsageStart,
        isRequiredOnResourceUsageTakeOver: formResponse.isRequiredOnResourceUsageTakeOver,
        isRequiredOnResourceUsageEnd: formResponse.isRequiredOnResourceUsageEnd,
        fields: formResponse.fields.map((field) => parseFieldFromResponse(field)),
      });
    } else if (isCreateMode) {
      setForm({ ...EMPTY_FORM, fields: [] });
    }
  }, [formResponse, isCreateMode]);

  const mutationVariables = useMemo(
    () => ({
      resourceId,
      formId: formResponse?.id ?? Number(formId),
    }),
    [resourceId, formId, formResponse?.id],
  );

  const createForm = useResourceFormsServiceResourceFormsCreate({
    onSuccess: async (data) => {
      toast.success({ title: t('editor.createSuccess') });
      await invalidateFormQueries(resourceId, queryClient, data.id);
      navigate(`/resources/${resourceId}/forms/${data.id}`, { replace: true });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const updateForm = useResourceFormsServiceResourceFormsUpdate({
    onSuccess: async () => {
      toast.success({ title: t('editor.updateSuccess') });
      await invalidateFormQueries(resourceId, queryClient, mutationVariables.formId);
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const deleteForm = useResourceFormsServiceResourceFormsDelete({
    onSuccess: async () => {
      toast.success({ title: t('editor.deleteSuccess') });
      await invalidateFormQueries(resourceId, queryClient, mutationVariables.formId);
      navigate(`/resources/${resourceId}/forms`, { replace: true });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const lastLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [fieldAdded, setFieldAdded] = useState(false);

  const addField = () => {
    const temporaryId = Date.now().toString();
    setForm((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          name: '',
          _id: temporaryId,
          type: FormFieldType.TEXT,
          isRequired: true,
          description: '',
          options: createDefaultFieldOptions(FormFieldType.TEXT),
        },
      ],
    }));
    setExpandedFieldKeys(new Set([`field-${temporaryId}`]));
    setFieldAdded(true);
  };

  useEffect(() => {
    if (fieldAdded && lastLabelInputRef.current) {
      lastLabelInputRef.current.focus();
      setFieldAdded(false);
    }
  }, [fieldAdded]);
  return {
    id,
    formId,
    resourceId,
    isCreateMode,
    navigate,
    queryClient,
    toast,
    t,
    tExists,
    resource,
    formResponse,
    isLoadingForm,
    form,
    setForm,
    deleteModalOpen,
    setDeleteModalOpen,
    expandedFieldKeys,
    setExpandedFieldKeys,
    mutationVariables,
    createForm,
    updateForm,
    deleteForm,
    lastLabelInputRef,
    fieldAdded,
    setFieldAdded,
    addField,
  } as const;
}

export function useFormEditorPageStateOutput(model: ReturnType<typeof useFormEditorPageStateInputs>) {
  const { setForm, form, isCreateMode, formResponse, toast, t, createForm, resourceId, updateForm, mutationVariables } =
    model;
  const updateField = (index: number, field: EditableFormField) => {
    model.setForm((prev) => {
      const nextFields = [...prev.fields];
      nextFields[index] = field;
      return { ...prev, fields: nextFields };
    });
  };

  const removeField = (index: number) => {
    model.setForm((prev) => {
      const nextFields = prev.fields.filter((_, i) => i !== index);
      return { ...prev, fields: nextFields };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setForm((prev) => {
        const oldIndex = prev.fields.findIndex((f) => (f._id ?? `field-${f.id}`) === active.id);
        const newIndex = prev.fields.findIndex((f) => (f._id ?? `field-${f.id}`) === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const newFields = arrayMove(prev.fields, oldIndex, newIndex);
        return { ...prev, fields: newFields };
      });
    },
    [setForm],
  );

  const fieldSortableIds = useMemo(() => form.fields.map((f) => f._id ?? `field-${f.id}`), [form.fields]);

  const hasUnsavedChanges = useMemo(() => {
    if (isCreateMode && form.fields.length === 0 && form.name === '') {
      return false;
    }
    if (!formResponse) {
      return true;
    }
    const normalize = (value: EditableForm) => JSON.stringify(sanitizeFormPayload(value));
    const referenceForm: EditableForm = {
      name: formResponse.name,
      isRequiredOnResourceUsageStart: formResponse.isRequiredOnResourceUsageStart,
      isRequiredOnResourceUsageTakeOver: formResponse.isRequiredOnResourceUsageTakeOver,
      isRequiredOnResourceUsageEnd: formResponse.isRequiredOnResourceUsageEnd,
      fields: formResponse.fields.map((field) => parseFieldFromResponse(field)),
    };
    return normalize(form) !== normalize(referenceForm);
  }, [form, formResponse, isCreateMode]);

  const handleSave = useCallback(async () => {
    if (form.fields.some((field) => !field.name.trim())) {
      toast.error({ title: t('editor.validation.missingFieldName') });
      return;
    }

    const payload = buildRequestBody(form);
    if (isCreateMode) {
      await createForm.mutateAsync({ resourceId: resourceId, requestBody: payload });
      return;
    }

    await updateForm.mutateAsync({
      resourceId: resourceId,
      formId: mutationVariables.formId,
      requestBody: payload,
    });
  }, [form, isCreateMode, createForm, updateForm, resourceId, mutationVariables.formId, toast, t]);

  const handleDelete = async () => {
    await model.deleteForm.mutateAsync({ resourceId: model.resourceId, formId: model.mutationVariables.formId });
    model.setDeleteModalOpen(false);
  };
  return {
    id: model.id,
    resourceId: model.resourceId,
    isCreateMode: model.isCreateMode,
    t: model.t,
    resource: model.resource,
    formResponse: model.formResponse,
    isLoadingForm: model.isLoadingForm,
    form: model.form,
    setForm: model.setForm,
    deleteModalOpen: model.deleteModalOpen,
    setDeleteModalOpen: model.setDeleteModalOpen,
    expandedFieldKeys: model.expandedFieldKeys,
    setExpandedFieldKeys: model.setExpandedFieldKeys,
    createForm: model.createForm,
    updateForm: model.updateForm,
    deleteForm: model.deleteForm,
    lastLabelInputRef: model.lastLabelInputRef,
    addField: model.addField,
    updateField,
    removeField,
    sensors,
    handleDragEnd,
    fieldSortableIds,
    hasUnsavedChanges,
    handleSave,
    handleDelete,
  } as const;
}

export function useFormEditor() {
  const useFormEditorPageStateInputsModel = useFormEditorPageStateInputs();
  return useFormEditorPageStateOutput(useFormEditorPageStateInputsModel);
}
