// Template management for the CSV export page — load, save as new, update, delete
// FEATURE: CSV export — persisted, instance-wide column configurations per export type
import {
  Button,
  Chip,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { StandardModal, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
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
import { useCallback, useMemo, useState } from 'react';
import { Select } from '../../../components/select';
import { useToastMessage } from '../../../components/toastProvider';
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

export function TemplateSection(props: Props) {
  const { exportType, currentColumns, onApply } = props;

  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: templates } = useAnalyticsServiceGetCsvExportTemplates({ exportType });

  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      await invalidateTemplates();
      setActiveTemplateId(created.id);
      setNameDraft(created.name);
      setSaveAsOpen(false);
      setSaveAsName('');
      toast.success({ title: t('templates.toasts.created', { name: created.name }) });
    },
    onError: (error) => {
      setSaveAsError(isDuplicateError(error) ? t('templates.errors.duplicate') : t('templates.errors.saveFailed'));
    },
  });

  const updateTemplate = useAnalyticsServiceUpdateCsvExportTemplate({
    onSuccess: async (updated) => {
      await invalidateTemplates();
      setNameDraft(updated.name);
      toast.success({ title: t('templates.toasts.updated', { name: updated.name }) });
    },
    onError: (error) => {
      toast.error({
        title: isDuplicateError(error) ? t('templates.errors.duplicate') : t('templates.errors.saveFailed'),
      });
    },
  });

  const deleteTemplate = useAnalyticsServiceDeleteCsvExportTemplate({
    onSuccess: async () => {
      await invalidateTemplates();
      setActiveTemplateId(null);
      setNameDraft('');
      setDeleteOpen(false);
      toast.success({ title: t('templates.toasts.deleted') });
    },
    onError: () => {
      setDeleteOpen(false);
      toast.error({ title: t('templates.errors.deleteFailed') });
    },
  });

  const selectTemplate = useCallback(
    (key: string) => {
      if (key === NO_TEMPLATE_KEY) {
        setActiveTemplateId(null);
        setNameDraft('');
        onApply(null);
        return;
      }
      const template = (templates ?? []).find((candidate: CsvExportTemplate) => String(candidate.id) === key);
      if (!template) return;
      setActiveTemplateId(template.id);
      setNameDraft(template.name);
      onApply(fromTemplateColumns(template.columns));
    },
    [templates, onApply],
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
  const submitSaveAs = () => {
    const name = saveAsName.trim();
    if (!name || currentColumns.length === 0) return;
    setSaveAsError(null);
    createTemplate.mutate({ requestBody: { name, exportType, columns: toRequestColumns(currentColumns) } });
  };

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
          className="min-w-0 md:max-w-xs"
          fullWidth
          data-cy="csv-export-template-select"
        />
        {activeTemplate && (
          <TextField
            value={nameDraft}
            onChange={setNameDraft}
            maxLength={NAME_MAX_LENGTH}
            className="min-w-0 md:max-w-xs"
            fullWidth
          >
            <Label className="text-sm font-medium">{t('templates.name')}</Label>
            <Input data-cy="csv-export-template-name" />
          </TextField>
        )}
      </div>

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
          <Button size="sm" variant="outline" onPress={() => setDeleteOpen(true)} data-cy="csv-export-template-delete">
            <Trash2Icon className="size-4" />
            {t('templates.delete')}
          </Button>
        )}
      </div>

      <StandardModal isOpen={saveAsOpen} onOpenChange={setSaveAsOpen} size="sm">
        {({ close }) => (
          <>
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
                <Label className="text-sm font-medium">{t('templates.name')}</Label>
                <Input
                  onKeyDown={(event) => event.key === 'Enter' && submitSaveAs()}
                  data-cy="csv-export-template-save-as-name"
                />
              </TextField>
              {saveAsError && (
                <p className="text-xs text-danger" role="alert" data-cy="csv-export-template-save-as-error">
                  {saveAsError}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('templates.cancel')}
              </Button>
              <Button
                variant="primary"
                isDisabled={saveAsName.trim() === ''}
                isPending={createTemplate.isPending}
                onPress={submitSaveAs}
                data-cy="csv-export-template-save-as-confirm"
              >
                {t('templates.save')}
              </Button>
            </ModalFooter>
          </>
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
        {t('templates.deleteMessage', { name: activeTemplate?.name ?? '' })}
      </StatusDialog>
    </section>
  );
}
