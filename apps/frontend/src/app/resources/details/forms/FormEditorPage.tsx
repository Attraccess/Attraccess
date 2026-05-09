import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  TextField,
  Label,
  Input,
  Selection,
  Spinner,
  Switch,
} from '@heroui/react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { FormFieldEditor } from './components/FormFieldEditor';
import { FormPreview } from './components/FormPreview';
import {
  EditableForm,
  EditableFormField,
  createDefaultFieldOptions,
  parseFieldFromResponse,
  serializeFieldOptions,
} from './types';
import en from './en.json';
import de from './de.json';

const EMPTY_FORM: EditableForm = {
  name: '',
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [],
};

export function FormEditorPage() {
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
  const [expandedFieldKey, setExpandedFieldKey] = useState<Selection | undefined>(undefined);

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
    setExpandedFieldKey(new Set([`field-${temporaryId}`]));
    setFieldAdded(true);
  };

  useEffect(() => {
    if (fieldAdded && lastLabelInputRef.current) {
      lastLabelInputRef.current.focus();
      setFieldAdded(false);
    }
  }, [fieldAdded]);

  const updateField = (index: number, field: EditableFormField) => {
    setForm((prev) => {
      const nextFields = [...prev.fields];
      nextFields[index] = field;
      return { ...prev, fields: nextFields };
    });
  };

  const removeField = (index: number) => {
    setForm((prev) => {
      const nextFields = prev.fields.filter((_, i) => i !== index);
      return { ...prev, fields: nextFields };
    });
  };

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
      await createForm.mutateAsync({ resourceId, requestBody: payload });
      return;
    }

    await updateForm.mutateAsync({
      resourceId,
      formId: mutationVariables.formId,
      requestBody: payload,
    });
  }, [form, isCreateMode, createForm, updateForm, resourceId, mutationVariables.formId, toast, t]);

  const handleDelete = async () => {
    await deleteForm.mutateAsync({ resourceId, formId: mutationVariables.formId });
    setDeleteModalOpen(false);
  };

  if (!isCreateMode && isLoadingForm) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isCreateMode ? t('editor.createTitle') : t('editor.editTitle', { formName: formResponse?.name ?? '' })}
        subtitle={resource?.name}
        backTo={`/resources/${resourceId}/forms`}
        actions={
          !isCreateMode && (
            <Button variant="danger-soft" onPress={() => setDeleteModalOpen(true)}>
              {t('editor.delete')}
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                isRequired
                value={form.name}
                onChange={(v) => setForm((prev) => ({ ...prev, name: v }))}
              >
                <Label>{t('editor.nameLabel')}</Label>
                <Input placeholder={t('editor.namePlaceholder')} />
              </TextField>
            </div>

            <div className="grid gap-2">
              <Switch
                isSelected={form.isRequiredOnResourceUsageStart}
                onValueChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageStart: value }))}
              >
                {t('editor.resourceUsageStart')}
              </Switch>
              <Switch
                isSelected={form.isRequiredOnResourceUsageTakeOver}
                onValueChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageTakeOver: value }))}
              >
                {t('editor.resourceUsageTakeover')}
              </Switch>
              <Switch
                isSelected={form.isRequiredOnResourceUsageEnd}
                onValueChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageEnd: value }))}
              >
                {t('editor.resourceUsageEnd')}
              </Switch>
            </div>

            <Divider />

            {form.fields.length === 0 && (
              <div className="rounded-lg border border-dashed border-default-200 p-6 text-center">
                <p className="font-medium text-default-600">{t('editor.emptyFieldsTitle')}</p>
                <p className="text-sm text-default-400">{t('editor.emptyFieldsDescription')}</p>
              </div>
            )}

            <Accordion
              selectionMode="single"
              variant="bordered"
              onSelectionChange={setExpandedFieldKey}
              selectedKeys={expandedFieldKey}
            >
              {form.fields.map((field, index) => {
                const key = `field-${field.id ?? field._id}`;
                const typeLabel = t(`fields.types.${field.type}`);

                return (
                  <AccordionItem
                    key={key} id={key}
                    aria-label={`${t('fields.label')} #${index + 1}`}
                    title={
                      <div className="flex flex-col text-start">
                        <span className="text-sm font-semibold text-default-700">
                          <i className="font-thin">#{index + 1}</i> {field.name || t('fields.placeholder.label')}
                        </span>
                        <span className="text-xs text-default-400">{typeLabel}</span>
                      </div>
                    }
                  >
                    <FormFieldEditor
                      field={field}
                      onChange={(value) => updateField(index, value)}
                      onRemove={() => removeField(index)}
                      t={t}
                      labelInputRef={index === form.fields.length - 1 ? lastLabelInputRef : undefined}
                    />
                  </AccordionItem>
                );
              })}
            </Accordion>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-default-700">{t('editor.fieldsTitle')}</h2>
              <Button variant="secondary" size="sm" onPress={addField}>
                {t('editor.addField')}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2">
              {hasUnsavedChanges && <span className="text-sm text-warning-500">{t('editor.unsaved')}</span>}
              <Button variant="primary"
                onPress={handleSave}
                isPending={createForm.isPending || updateForm.isPending}
                isDisabled={!form.name || form.fields.length === 0}
              >
                {t('editor.save')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="font-semibold text-default-700">{t('editor.previewTitle')}</p>
          </CardHeader>
          <CardContent>
            <FormPreview fields={form.fields} t={t} />
          </CardContent>
        </Card>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        itemName={formResponse?.name ?? ''}
        isDeleting={deleteForm.isPending}
      />
    </div>
  );
}

function buildRequestBody(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    fields: form.fields.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || undefined,
      options: serializeFieldOptions(field.type, field.options) ?? undefined,
    })),
  };
}

function sanitizeFormPayload(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    fields: form.fields.map((field) => ({
      id: field.id ?? null,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || '',
      options: serializeFieldOptions(field.type, field.options),
    })),
  };
}

async function invalidateFormQueries(
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
