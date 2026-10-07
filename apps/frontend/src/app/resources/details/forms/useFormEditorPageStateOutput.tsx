import { useCallback, useMemo } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { EditableForm, EditableFormField, parseFieldFromResponse } from './types';
import { buildRequestBody } from './FormEditorPage.helpers';
import { sanitizeFormPayload } from './FormEditorPage.helpers';
import type { useFormEditorPageStateInputs } from './useFormEditorPageStateInputs';

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
