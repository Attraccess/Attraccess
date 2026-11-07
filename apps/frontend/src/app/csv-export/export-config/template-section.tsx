// Template management for the CSV export page — load, save as new, update, delete
// FEATURE: CSV export — persisted, instance-wide column configurations per export type
import {
  Chip,
  FieldError,
  Form,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { Button, StandardModal, StatusAlert, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  CsvExportTemplate,
  CsvExportTemplateColumnDto,
  CsvExportType,
  useAnalyticsServiceCreateCsvExportTemplate,
  useAnalyticsServiceDeleteCsvExportTemplate,
  useAnalyticsServiceGetCsvExportTemplates,
  useAnalyticsServiceGetCsvExportTemplatesKey,
  useAnalyticsServiceUpdateCsvExportTemplate,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { SaveIcon, SaveAllIcon, Trash2Icon } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import { Select } from '../../../components/select';
import { useToastMessage } from '../../../components/toastProvider';
import { getApiErrorMessage } from '../../../utils/apiError';
import { ConfiguredColumn, fromTemplateColumns, toTemplateColumns } from './csv';
import de from './de.json';
import en from './en.json';

const NO_TEMPLATE_KEY = '__none__';
const NAME_MAX_LENGTH = 120;

interface Props {
  exportType: CsvExportType;
  currentColumns: ConfiguredColumn[];
  /** Called with the template's columns, or null to go back to the default columns. */
  onApply: (columns: ConfiguredColumn[] | null) => void;
}

// The generated client models the column type as a string enum; the values are identical to csv.ts' literals.
const toRequestColumns = (columns: ConfiguredColumn[]) => toTemplateColumns(columns) as CsvExportTemplateColumnDto[];

const isDuplicateError = (error: unknown) => error instanceof ApiError && error.status === 409;
// The server's message (e.g. a validation error) as toast description; undefined for non-Error rejections.
const errorDescription = (error: unknown) => (error instanceof Error ? getApiErrorMessage(error) : undefined);

export function TemplateSection(props: Props) {
  const { exportType, currentColumns, onApply } = props;

  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const {
    data: templates,
    isLoading: templatesLoading,
    isError: templatesFailed,
  } = useAnalyticsServiceGetCsvExportTemplates({ exportType });

  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  // Mirrors activeTemplateId for mutation callbacks that resolve after the user may have switched templates.
  const activeTemplateIdRef = useRef<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  // Set synchronously on submit: isPending only flips after a re-render, so a quick second Enter would POST again.
  const createInFlight = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activate = useCallback((template: Pick<CsvExportTemplate, 'id' | 'name'> | null) => {
    activeTemplateIdRef.current = template?.id ?? null;
    setActiveTemplateId(template?.id ?? null);
    setNameDraft(template?.name ?? '');
    setNameError(null);
  }, []);

  const activeTemplate = useMemo(
    () => (templates ?? []).find((template) => template.id === activeTemplateId) ?? null,
    [templates, activeTemplateId],
  );

  const columnsDirty = useMemo(() => {
    if (!activeTemplate) return false;
    const stored = toTemplateColumns(fromTemplateColumns(activeTemplate.columns));
    return JSON.stringify(stored) !== JSON.stringify(toTemplateColumns(currentColumns));
  }, [activeTemplate, currentColumns]);
  const trimmedName = nameDraft.trim();
  const nameDirty = activeTemplate !== null && trimmedName !== activeTemplate.name;
  const canUpdate =
    activeTemplate !== null && (columnsDirty || nameDirty) && trimmedName !== '' && currentColumns.length > 0;

  const invalidateTemplates = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [useAnalyticsServiceGetCsvExportTemplatesKey] }),
    [queryClient],
  );

  const createTemplate = useAnalyticsServiceCreateCsvExportTemplate({
    onSuccess: async (created) => {
      createInFlight.current = false;
      await invalidateTemplates();
      activate(created);
      setSaveAsOpen(false);
      setSaveAsName('');
      toast.success({ title: t('templates.toasts.created', { name: created.name }) });
    },
    onError: (error) => {
      createInFlight.current = false;
      if (isDuplicateError(error)) {
        setSaveAsError(t('templates.errors.duplicate'));
        return;
      }
      toast.error({ title: t('templates.errors.saveFailed'), description: errorDescription(error) });
    },
  });

  const updateTemplate = useAnalyticsServiceUpdateCsvExportTemplate({
    onSuccess: async (updated) => {
      await invalidateTemplates();
      // the user may have switched to another template while the request was running
      if (activeTemplateIdRef.current === updated.id) {
        setNameDraft(updated.name);
        setNameError(null);
      }
      toast.success({ title: t('templates.toasts.updated', { name: updated.name }) });
    },
    onError: (error, { id }) => {
      const duplicate = isDuplicateError(error);
      if (duplicate && activeTemplateIdRef.current === id) setNameError(t('templates.errors.duplicate'));
      toast.error({
        title: duplicate ? t('templates.errors.duplicate') : t('templates.errors.saveFailed'),
        description: duplicate ? undefined : errorDescription(error),
      });
    },
  });

  const deleteTemplate = useAnalyticsServiceDeleteCsvExportTemplate({
    onSuccess: async (_result, { id }) => {
      await invalidateTemplates();
      if (activeTemplateIdRef.current === id) activate(null);
      setDeleteOpen(false);
      toast.success({ title: t('templates.toasts.deleted') });
    },
    onError: (error, { id }) => {
      setDeleteOpen(false);
      toast.error({ title: t('templates.errors.deleteFailed'), description: errorDescription(error) });
      // somebody else may have deleted it already: stop offering a template that no longer exists
      void invalidateTemplates();
      if (error instanceof ApiError && error.status === 404 && activeTemplateIdRef.current === id) {
        activate(null);
      }
    },
  });

  const selectTemplate = useCallback(
    (key: string) => {
      if (key === NO_TEMPLATE_KEY) {
        activate(null);
        onApply(null);
        return;
      }
      const template = (templates ?? []).find((candidate: CsvExportTemplate) => String(candidate.id) === key);
      if (!template) return;
      activate(template);
      onApply(fromTemplateColumns(template.columns));
    },
    [templates, onApply, activate],
  );

  const selectItems = useMemo(
    () => [
      { key: NO_TEMPLATE_KEY, label: t('templates.none') },
      ...(templates ?? []).map((template) => ({ key: String(template.id), label: template.name })),
    ],
    [templates, t],
  );

  const openSaveAs = () => {
    setSaveAsName('');
    setSaveAsError(null);
    setSaveAsOpen(true);
  };
  const submitSaveAs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = saveAsName.trim();
    if (!name || currentColumns.length === 0 || createInFlight.current || createTemplate.isPending) return;
    createInFlight.current = true;
    setSaveAsError(null);
    createTemplate.mutate({ requestBody: { name, exportType, columns: toRequestColumns(currentColumns) } });
  };
  const mutationPending = updateTemplate.isPending || deleteTemplate.isPending;

  return (
    <section className="flex min-w-0 flex-col gap-3" data-cy="csv-export-template-section">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('templates.title')}</h2>
          {(columnsDirty || nameDirty) && (
            <Chip size="sm" color="warning" data-cy="csv-export-template-dirty-chip">
              {t('templates.unsavedChanges')}
            </Chip>
          )}
        </div>
        <p className="text-sm text-muted">{t('templates.description')}</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Select
          label={t('templates.label')}
          value={activeTemplateId === null ? NO_TEMPLATE_KEY : String(activeTemplateId)}
          onChange={selectTemplate}
          items={selectItems}
          isDisabled={templatesLoading || mutationPending}
          className="min-w-0 md:max-w-xs"
          fullWidth
          data-cy="csv-export-template-select"
        />
        {activeTemplate && (
          <TextField
            value={nameDraft}
            onChange={(value) => {
              setNameDraft(value);
              setNameError(null);
            }}
            maxLength={NAME_MAX_LENGTH}
            isInvalid={nameError !== null}
            className="min-w-0 md:max-w-xs"
            fullWidth
          >
            <Label>{t('templates.name')}</Label>
            <Input data-cy="csv-export-template-name" />
            {nameError && <FieldError data-cy="csv-export-template-name-error">{nameError}</FieldError>}
          </TextField>
        )}
      </div>

      {templatesFailed && (
        <StatusAlert status="danger" data-cy="csv-export-template-load-error">
          {t('templates.errors.loadFailed')}
        </StatusAlert>
      )}

      <div className="flex flex-wrap gap-2">
        {activeTemplate && (
          <Button
            size="sm"
            variant="primary"
            isDisabled={!canUpdate}
            isPending={updateTemplate.isPending}
            onPress={() =>
              updateTemplate.mutate({
                id: activeTemplate.id,
                requestBody: { name: trimmedName, columns: toRequestColumns(currentColumns) },
              })
            }
            data-cy="csv-export-template-update"
          >
            <SaveIcon className="size-4" />
            {t('templates.update')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          isDisabled={currentColumns.length === 0}
          onPress={openSaveAs}
          data-cy="csv-export-template-save-as"
        >
          <SaveAllIcon className="size-4" />
          {t('templates.saveAsNew')}
        </Button>
        {activeTemplate && (
          <Button
            size="sm"
            variant="outline"
            isDisabled={updateTemplate.isPending}
            onPress={() => setDeleteOpen(true)}
            data-cy="csv-export-template-delete"
          >
            <Trash2Icon className="size-4" />
            {t('templates.delete')}
          </Button>
        )}
      </div>

      <StandardModal isOpen={saveAsOpen} onOpenChange={setSaveAsOpen} size="sm">
        {({ close }) => (
          <Form onSubmit={submitSaveAs} className="contents" data-cy="csv-export-template-save-as-form">
            <ModalHeader>
              <ModalHeading>{t('templates.saveAsTitle')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <TextField
                value={saveAsName}
                onChange={(value) => {
                  setSaveAsName(value);
                  setSaveAsError(null);
                }}
                maxLength={NAME_MAX_LENGTH}
                isInvalid={saveAsError !== null}
                autoFocus
                fullWidth
              >
                <Label>{t('templates.name')}</Label>
                <Input data-cy="csv-export-template-save-as-name" />
                {saveAsError && <FieldError data-cy="csv-export-template-save-as-error">{saveAsError}</FieldError>}
              </TextField>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close} isDisabled={createTemplate.isPending}>
                {t('templates.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                isDisabled={saveAsName.trim() === ''}
                isPending={createTemplate.isPending}
                data-cy="csv-export-template-save-as-confirm"
              >
                {t('templates.save')}
              </Button>
            </ModalFooter>
          </Form>
        )}
      </StandardModal>

      <StatusDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        status="error"
        title={t('templates.deleteTitle')}
        closeLabel={t('templates.cancel')}
        action={{
          label: t('templates.delete'),
          onPress: () => activeTemplate && deleteTemplate.mutate({ id: activeTemplate.id }),
          isPending: deleteTemplate.isPending,
          'data-cy': 'csv-export-template-delete-confirm',
        }}
        data-cy="csv-export-template-delete-dialog"
      >
        <span className="wrap-anywhere">{t('templates.deleteMessage', { name: activeTemplate?.name ?? '' })}</span>
      </StatusDialog>
    </section>
  );
}
