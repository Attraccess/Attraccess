import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@attraccess/react-query-client';
import { Selection } from '@heroui/react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { EditableForm, createDefaultFieldOptions, parseFieldFromResponse } from './types';
import en from './en.json';
import de from './de.json';
import { EMPTY_FORM } from './FormEditorPage.empty-form';
import { invalidateFormQueries } from './FormEditorPage.helpers';

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
