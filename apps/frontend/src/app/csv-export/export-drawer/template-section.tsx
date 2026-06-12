// Template management for the CSV export drawer — load, save, save-as, delete
// FEATURE: CSV export — persisted, shareable column configurations per export type
import { Button, Chip, Input, Label, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { SaveIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  CsvExportTemplate,
  CsvExportTemplateColumnDto,
  CsvExportType,
  csvExportTemplatesQueryKey,
  useCreateCsvExportTemplate,
  useCsvExportTemplates,
  useDeleteCsvExportTemplate,
  useUpdateCsvExportTemplate,
} from './template-api';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Select } from '../../../components/select';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useToastMessage } from '../../../components/toastProvider';
import de from './de.json';
import en from './en.json';

const NO_TEMPLATE_KEY = '__none__';

interface Props {
  exportType: CsvExportType;
  currentColumns: CsvExportTemplateColumnDto[];
  onApply: (template: CsvExportTemplate) => void;
}

export function TemplateSection(props: Props) {
  const { exportType, currentColumns, onApply } = props;

  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: templates } = useCsvExportTemplates(exportType);

  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const activeTemplate = useMemo(
    () => (templates ?? []).find((template) => template.id === activeTemplateId) ?? null,
    [templates, activeTemplateId],
  );

  const isDirty = useMemo(() => {
    if (!activeTemplate) {
      return false;
    }
    return JSON.stringify(activeTemplate.columns) !== JSON.stringify(currentColumns);
  }, [activeTemplate, currentColumns]);

  const invalidateTemplates = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [csvExportTemplatesQueryKey] });
  }, [queryClient]);

  const createTemplate = useCreateCsvExportTemplate({
    onSuccess: (created) => {
      invalidateTemplates();
      setActiveTemplateId(created.id);
      setShowSaveAs(false);
      setSaveAsName('');
      toast.success({ title: t('templates.toasts.created', { name: created.name }) });
    },
    onError: () => {
      toast.error({ title: t('templates.toasts.saveFailed') });
    },
  });

  const updateTemplate = useUpdateCsvExportTemplate({
    onSuccess: (updated) => {
      invalidateTemplates();
      toast.success({ title: t('templates.toasts.updated', { name: updated.name }) });
    },
    onError: () => {
      toast.error({ title: t('templates.toasts.saveFailed') });
    },
  });

  const deleteTemplate = useDeleteCsvExportTemplate({
    onSuccess: () => {
      invalidateTemplates();
      setActiveTemplateId(null);
      setShowDeleteConfirm(false);
      toast.success({ title: t('templates.toasts.deleted') });
    },
    onError: () => {
      toast.error({ title: t('templates.toasts.deleteFailed') });
    },
  });

  const selectTemplate = useCallback(
    (key: string) => {
      if (key === NO_TEMPLATE_KEY) {
        setActiveTemplateId(null);
        return;
      }
      const template = (templates ?? []).find((candidate) => String(candidate.id) === key);
      if (!template) {
        return;
      }
      setActiveTemplateId(template.id);
      onApply(template);
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

  return (
    <section className="flex min-w-0 flex-col gap-3" data-cy="csv-export-template-section">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{t('templates.label')}</Label>
        {isDirty && (
          <Chip size="sm" color="warning" data-cy="csv-export-template-dirty-chip">
            {t('templates.unsavedChanges')}
          </Chip>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          aria-label={t('templates.label')}
          value={activeTemplateId === null ? NO_TEMPLATE_KEY : String(activeTemplateId)}
          onChange={selectTemplate}
          items={selectItems}
          className="sm:max-w-xs"
          fullWidth
          data-cy="csv-export-template-select"
        />
        <div className="flex flex-wrap items-center gap-2">
          {activeTemplate && (
            <Button
              size="sm"
              variant="outline"
              isDisabled={!isDirty}
              isPending={updateTemplate.isPending}
              onPress={() =>
                updateTemplate.mutate({ id: activeTemplate.id, requestBody: { columns: currentColumns } })
              }
              data-cy="csv-export-template-save"
            >
              <SaveIcon className="size-4" />
              {t('templates.save')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onPress={() => setShowSaveAs((previous) => !previous)}
            isDisabled={currentColumns.length === 0}
            data-cy="csv-export-template-save-as"
          >
            {t('templates.saveAs')}
          </Button>
          {activeTemplate && (
            <Button
              size="sm"
              variant="danger-soft"
              isIconOnly
              aria-label={t('templates.delete')}
              onPress={() => setShowDeleteConfirm(true)}
              data-cy="csv-export-template-delete"
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {showSaveAs && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField value={saveAsName} onChange={setSaveAsName} className="flex-1" data-cy="csv-export-template-name">
            <Label className="text-sm">{t('templates.nameLabel')}</Label>
            <Input placeholder={t('templates.namePlaceholder')} />
          </TextField>
          <Button
            size="sm"
            variant="primary"
            isDisabled={saveAsName.trim().length === 0 || currentColumns.length === 0}
            isPending={createTemplate.isPending}
            onPress={() =>
              createTemplate.mutate({
                requestBody: { name: saveAsName.trim(), exportType, columns: currentColumns },
              })
            }
            data-cy="csv-export-template-create"
          >
            {t('templates.create')}
          </Button>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => activeTemplate && deleteTemplate.mutate({ id: activeTemplate.id })}
        itemName={activeTemplate?.name ?? ''}
        isDeleting={deleteTemplate.isPending}
      />
    </section>
  );
}
