import { Button, DeleteConfirmationModal, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  useResourceFormsCreate,
  useResourceFormsDelete,
  useResourceFormsGetOne,
  useResourceFormsUpdate,
  useGetOneResourceById,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { FormPreview } from './components/FormPreview';
import { EditableForm, parseFieldFromResponse } from './types';
import { FormFieldsSection } from './editor/FormFieldsSection';
import { FormSettingsSections } from './editor/FormSettingsSections';
import { EMPTY_FORM, buildRequestBody, invalidateFormQueries, sanitizeFormPayload } from './editor/formPayloads';
import en from './en.json';
import de from './de.json';

export function FormEditorPage() {
  const { id, formId } = useParams<{ id: string; formId: string }>();
  const resourceId = Number(id);
  const isCreateMode = !formId || formId === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t, tExists } = useTranslations({ en, de });

  const { data: resource } = useGetOneResourceById({ path: { id: resourceId } });
  const { data: formResponse, isLoading: isLoadingForm } = useResourceFormsGetOne(
    { path: { resourceId, formId: Number(formId) } },
    undefined,
    { enabled: !isCreateMode && Number.isFinite(resourceId) },
  );

  const [form, setForm] = useState<EditableForm>({ ...EMPTY_FORM, fields: [] });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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

  const createForm = useResourceFormsCreate(undefined, {
    onSuccess: async (data) => {
      toast.success({ title: t('editor.createSuccess') });
      await invalidateFormQueries(resourceId, queryClient, data.id);
      navigate(`/resources/${resourceId}/forms/${data.id}`, { replace: true });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const updateForm = useResourceFormsUpdate(undefined, {
    onSuccess: async () => {
      toast.success({ title: t('editor.updateSuccess') });
      await invalidateFormQueries(resourceId, queryClient, mutationVariables.formId);
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const deleteForm = useResourceFormsDelete(undefined, {
    onSuccess: async () => {
      toast.success({ title: t('editor.deleteSuccess') });
      await invalidateFormQueries(resourceId, queryClient, mutationVariables.formId);
      navigate(`/resources/${resourceId}/forms`, { replace: true });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

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

  const handleSave = async () => {
    if (form.fields.some((field) => !field.name.trim())) {
      toast.error({ title: t('editor.validation.missingFieldName') });
      return;
    }

    const payload = buildRequestBody(form);
    if (isCreateMode) {
      await createForm.mutateAsync({ path: { resourceId }, body: payload });
      return;
    }

    await updateForm.mutateAsync({ path: { resourceId, formId: mutationVariables.formId }, body: payload });
  };

  const handleDelete = async () => {
    await deleteForm.mutateAsync({ path: { resourceId, formId: mutationVariables.formId } });
    setDeleteModalOpen(false);
  };

  if (!isCreateMode && isLoadingForm) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isCreateMode ? t('editor.createTitle') : t('editor.editTitle', { formName: formResponse?.name ?? '' })}
        subtitle={resource?.name}
        backTo={`/resources/${resourceId}/forms`}
        actions={[
          {
            key: 'delete',
            label: t('editor.delete'),
            variant: 'destructive',
            isHidden: isCreateMode,
            onPress: () => setDeleteModalOpen(true),
          },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]" data-cy="form-editor-page">
        <div className="flex flex-col gap-8">
          <FormSettingsSections form={form} setForm={setForm} />

          <FormFieldsSection
            fields={form.fields}
            onFieldsChange={(update) => setForm((prev) => ({ ...prev, fields: update(prev.fields) }))}
          />

          <div className="flex items-center justify-between pt-6 border-t border-default-200">
            {hasUnsavedChanges ? <span className="text-sm text-warning-500">{t('editor.unsaved')}</span> : <span />}
            <Button
              variant="primary"
              onPress={handleSave}
              isPending={createForm.isPending || updateForm.isPending}
              isDisabled={!form.name || form.fields.length === 0}
              data-cy="form-editor-save-button"
            >
              {t('editor.save')}
            </Button>
          </div>
        </div>

        <aside className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 lg:pt-0 lg:border-t-0 lg:border-l lg:border-default-200 lg:pl-6">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('editor.sections.preview')}
          </h3>
          <FormPreview fields={form.fields} />
        </aside>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        itemName={formResponse?.name ?? ''}
        isDeleting={deleteForm.isPending}
      />
    </div>
  );
}
