import { PageHeader } from '@attraccess/plugins-frontend-ui';
import { Spinner, Tab, TabList, TabPanel, Tabs } from '@heroui/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  FormScope,
  UseFormsGetOneKeyFn,
  UseFormsListResourcesKeyFn,
  useFormsCreate,
  useFormsDelete,
  useFormsGetOne,
  useFormsListResources,
  useFormsListSubmissions,
  useFormsUpdate,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { EditableForm } from './types';
import { FormEditorBody } from './editor/FormEditorBody';
import { FormSubmissionsPanel } from './editor/FormSubmissionsPanel';
import { DeletedFormSubmissions } from './DeletedFormSubmissions';
import {
  EMPTY_FORM,
  buildRequestBody,
  invalidateFormQueries,
  sanitizeFormPayload,
  toEditableForm,
} from './editor/formPayloads';
import { NotFound } from '../not-found';
import { DEFAULT_RETRIES } from '../../api/queryClient';
import { useFormsTranslations } from './useFormsTranslations';

type EditorTab = 'form' | 'submissions';

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

/** A missing or deleted form stays missing; other failures are retried as usual. */
const retryFormLookup = (failureCount: number, error: unknown) =>
  statusOf(error) !== 404 && failureCount < DEFAULT_RETRIES;

/** The form a create starts from: `?scope=resource&resourceId=N` preselects the resource it was opened from. */
function initialForm(searchParams: URLSearchParams): EditableForm {
  const resourceId = Number(searchParams.get('resourceId'));
  if (searchParams.get('scope') === FormScope.RESOURCE && Number.isInteger(resourceId) && resourceId > 0) {
    return { ...EMPTY_FORM, scope: FormScope.RESOURCE, resourceId, fields: [] };
  }
  return { ...EMPTY_FORM, fields: [] };
}

/** Creates and edits a form of any scope, shows where it applies and its submissions. */
export function FormEditorPage() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateMode = !formId || formId === 'new';
  const isValidFormId = /^\d+$/.test(formId ?? '') && Number(formId) > 0;
  const numericFormId = Number(formId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t, tExists } = useFormsTranslations();

  const {
    data: formResponse,
    isLoading: isLoadingForm,
    error: formError,
  } = useFormsGetOne({ path: { formId: numericFormId } }, undefined, {
    enabled: !isCreateMode && isValidFormId,
    retry: retryFormLookup,
  });
  const { data: appliedResources } = useFormsListResources({ path: { formId: numericFormId } }, undefined, {
    enabled: !isCreateMode && isValidFormId,
    retry: retryFormLookup,
  });
  // The API answers 404 for a deleted form but still lists its submissions; an unknown id has neither.
  const isFormMissing = !isCreateMode && statusOf(formError) === 404;
  const { data: deletedFormSubmissions, isLoading: isLoadingDeletedForm } = useFormsListSubmissions(
    { path: { formId: numericFormId }, query: { page: 1, limit: 1 } },
    undefined,
    { enabled: isFormMissing && isValidFormId, retry: retryFormLookup },
  );

  const formName = formResponse?.name ?? '';

  const [form, setForm] = useState<EditableForm>(() => initialForm(searchParams));

  const tab: EditorTab = !isCreateMode && searchParams.get('tab') === 'submissions' ? 'submissions' : 'form';
  const submissionsResourceId = Number(searchParams.get('resourceId')) || null;
  const updateSearch = (changes: Record<string, string | null>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    if (formResponse) {
      setForm(toEditableForm(formResponse));
    }
  }, [formResponse]);

  const onError = (error: unknown) =>
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });

  const createForm = useFormsCreate(undefined, {
    onSuccess: async (data) => {
      toast.success({ title: t('editor.createSuccess') });
      await invalidateFormQueries(queryClient);
      navigate(`/forms/${data.id}`, { replace: true });
    },
    onError,
  });

  const updateForm = useFormsUpdate(undefined, {
    onSuccess: async () => {
      toast.success({ title: t('editor.updateSuccess') });
      await invalidateFormQueries(queryClient);
    },
    onError,
  });

  const deleteForm = useFormsDelete(undefined, {
    onSuccess: async () => {
      toast.success({ title: t('editor.deleteSuccess') });
      // Leave first and drop this form's own queries: refetching them would answer 404 and briefly show the
      // deleted-form view before the list.
      navigate('/forms', { replace: true });
      const path = { formId: numericFormId };
      queryClient.removeQueries({ queryKey: UseFormsGetOneKeyFn({ path }) });
      queryClient.removeQueries({ queryKey: UseFormsListResourcesKeyFn({ path }) });
      await invalidateFormQueries(queryClient);
    },
    onError,
  });

  const hasUnsavedChanges = useMemo(() => {
    if (isCreateMode && form.fields.length === 0 && form.name === '') {
      return false;
    }
    if (!formResponse) {
      return true;
    }
    const normalize = (value: EditableForm) => JSON.stringify(sanitizeFormPayload(value));
    return normalize(form) !== normalize(toEditableForm(formResponse));
  }, [form, formResponse, isCreateMode]);

  const handleSave = async () => {
    if (form.fields.some((field) => !field.name.trim())) {
      toast.error({ title: t('editor.validation.missingFieldName') });
      return;
    }

    const payload = buildRequestBody(form);
    if (isCreateMode) {
      await createForm.mutateAsync({ body: payload });
      return;
    }

    await updateForm.mutateAsync({ path: { formId: numericFormId }, body: payload });
  };

  if (!isCreateMode && !isValidFormId) {
    return <NotFound />;
  }

  if (isFormMissing && !isLoadingDeletedForm) {
    return deletedFormSubmissions ? (
      <DeletedFormSubmissions
        formId={numericFormId}
        resourceId={submissionsResourceId}
        onResourceIdChange={(resourceId) =>
          updateSearch({ resourceId: resourceId === null ? null : String(resourceId) })
        }
      />
    ) : (
      <NotFound />
    );
  }

  if (!isCreateMode && (isLoadingForm || isFormMissing)) {
    return (
      <div className="flex justify-center py-10">
        <Spinner color="accent" />
      </div>
    );
  }

  const editor = (
    <FormEditorBody
      form={form}
      setForm={setForm}
      appliedResources={isCreateMode ? undefined : appliedResources}
      hasUnsavedChanges={hasUnsavedChanges}
      isSaving={createForm.isPending || updateForm.isPending}
      onSave={handleSave}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isCreateMode ? t('editor.createTitle') : t('editor.editTitle', { formName })}
        backTo="/forms"
        actions={[
          {
            key: 'delete',
            label: t('editor.delete'),
            variant: 'destructive',
            isHidden: isCreateMode,
            dataCy: 'form-editor-delete-button',
            onPress: () => deleteForm.mutateAsync({ path: { formId: numericFormId } }),
            confirm: {
              title: t('editor.deleteConfirmTitle', { formName }),
              // Every resource the form reaches, switched-off ones included: a delete removes it from all of them.
              message: appliedResources?.length
                ? t('editor.deleteConfirmDescription', { count: appliedResources.length })
                : t('editor.deleteConfirmDescriptionNone'),
              cancelLabel: t('editor.deleteCancel'),
              'data-cy': 'form-editor-delete-dialog',
              confirmDataCy: 'form-editor-delete-confirm',
            },
          },
        ]}
      />

      {isCreateMode ? (
        editor
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => updateSearch({ tab: key === 'submissions' ? 'submissions' : null })}
          className="w-full"
        >
          <Tabs.ListContainer>
            <TabList aria-label={t('editor.editTitle', { formName })}>
              <Tab id="form" data-cy="form-editor-form-tab">
                <Tabs.Indicator />
                {t('editor.tabs.form')}
              </Tab>
              <Tab id="submissions" data-cy="form-editor-submissions-tab">
                <Tabs.Indicator />
                {t('editor.tabs.submissions')}
              </Tab>
            </TabList>
          </Tabs.ListContainer>
          <TabPanel id="form" className="pt-4">
            {editor}
          </TabPanel>
          <TabPanel id="submissions" className="pt-4">
            <FormSubmissionsPanel
              formId={numericFormId}
              resources={(appliedResources ?? []).map((resource) => ({
                id: resource.resourceId,
                name: resource.resourceName,
              }))}
              resourceId={submissionsResourceId}
              onResourceIdChange={(resourceId) =>
                updateSearch({ resourceId: resourceId === null ? null : String(resourceId) })
              }
            />
          </TabPanel>
        </Tabs>
      )}
    </div>
  );
}
