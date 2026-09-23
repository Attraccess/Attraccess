import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Button, Spinner } from '@heroui/react';
import { FolderIcon, Gauge, ListChecks, Settings2Icon, StethoscopeIcon, WorkflowIcon, WrenchIcon } from 'lucide-react';
import {
  Resource,
  ResourceType,
  SupervisionMode,
  UpdateResourceDto,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceUpdateOneResource,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import { SettingsDirectory, type SettingsDirectoryGroup } from '../../../components/settingsDirectory';
import { useToastMessage } from '../../../components/toastProvider';
import { SharedDataTab } from '../editModal/tabs/shared';
import { MachineTab } from '../editModal/tabs/machine';
import { DoorTab } from '../editModal/tabs/door';
import { RetrainingTab } from '../editModal/tabs/retraining';
import { SupervisionTab } from '../editModal/tabs/supervision';
import { ResourceMetadataEditor } from '../editModal/resourceMetadataEditor';
import editorEn from '../editModal/resourceEditModal.en.json';
import editorDe from '../editModal/resourceEditModal.de.json';
import en from './en.json';
import de from './de.json';

type FormData = Omit<UpdateResourceDto, 'metadata'> & { metadata: Record<string, unknown> };

function fromResource(resource: Resource): FormData {
  return {
    name: resource.name,
    description: resource.description ?? '',
    allowTakeOver: resource.allowTakeOver ?? false,
    type: resource.type ?? ResourceType.MACHINE,
    separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch ?? false,
    retrainingMaxAgeDays: resource.retrainingMaxAgeDays ?? null,
    retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays ?? null,
    retrainingBlocksAccess: resource.retrainingBlocksAccess ?? false,
    supervisionMode: resource.supervisionMode ?? SupervisionMode.INTRODUCTION_REQUIRED,
    supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction ?? null,
    autoIntroductionTarget: resource.autoIntroductionTarget ?? null,
    autoIntroductionGroupId: resource.autoIntroductionGroupId ?? null,
    metadata: (resource.metadata ?? {}) as Record<string, unknown>,
  };
}

export function ResourceSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number(id);
  if (!Number.isInteger(resourceId) || resourceId <= 0) return <Navigate to="/resources" replace />;
  return <ResourceSettingsEditor resourceId={resourceId} />;
}

function ResourceSettingsEditor({ resourceId }: { resourceId: number }) {
  const { t } = useTranslations({ en: { ...editorEn, ...en }, de: { ...editorDe, ...de } });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: resource, isLoading, error } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const [formData, setFormData] = useState<FormData | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>();
  const [deleteImage, setDeleteImage] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editRevision = useRef(0);
  const submittedRevision = useRef(0);

  useEffect(() => {
    if (resource && !dirty) setFormData(fromResource(resource));
  }, [resource, dirty]);

  const setField = useCallback(<T extends keyof FormData>(field: T, value: FormData[T]) => {
    editRevision.current += 1;
    setFormData((previous) => previous && { ...previous, [field]: value });
    setDirty(true);
  }, []);

  const updateResource = useResourcesServiceUpdateOneResource({
    onSuccess: (updated) => {
      toast.success({
        title: t('update.success.toast.title'),
        description: t('update.success.toast.description', { name: updated.name }),
      });
      queryClient.setQueryData(UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }), updated);
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
      queryClient.invalidateQueries({ queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }) });
      if (editRevision.current === submittedRevision.current) {
        setFormData(fromResource(updated));
        setSelectedImage(undefined);
        setDeleteImage(false);
        setDirty(false);
      }
    },
    onError: (updateError) =>
      toast.error({
        title: t('update.error.toast.title'),
        description: `${t('update.error.toast.description')} ${(updateError as Error).message}`,
      }),
  });

  const save = () => {
    if (updateResource.isPending) return;
    if (!formData || !formData.name?.trim()) {
      toast.error({ title: t('inputs.name.required') });
      return;
    }
    submittedRevision.current = editRevision.current;
    updateResource.mutate({
      id: resourceId,
      formData: { ...formData, name: formData.name.trim(), image: selectedImage ?? undefined, deleteImage },
    });
  };

  if (isLoading || (!resource && !error))
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  if (error || !resource || !formData) return <div className="py-16 text-center">{t('notFound')}</div>;

  const saveButton = (
    <div className="mt-5 flex justify-end">
      <Button
        variant="primary"
        onPress={save}
        isPending={updateResource.isPending}
        isDisabled={!dirty}
        data-cy="resource-settings-save"
      >
        {t('save')}
      </Button>
    </div>
  );
  const editorProps = { t, formData, setField, resource };
  const groups: SettingsDirectoryGroup[] = [
    {
      key: 'general',
      label: t('groups.general'),
      items: [
        {
          key: 'details',
          title: t('topics.details.title'),
          description: t('topics.details.description'),
          icon: <Gauge size={19} />,
          content: (
            <>
              <SharedDataTab
                {...editorProps}
                onImageSelected={(file) => {
                  editRevision.current += 1;
                  setSelectedImage(file);
                  setDeleteImage(file === null);
                  setDirty(true);
                }}
              />
              {saveButton}
            </>
          ),
        },
        {
          key: 'behavior',
          title: t('topics.behavior.title'),
          description: t('topics.behavior.description'),
          icon: <WrenchIcon size={19} />,
          content: (
            <>
              <div className="flex flex-col gap-5">
                <div className="flex gap-2">
                  {[ResourceType.MACHINE, ResourceType.DOOR].map((type) => (
                    <Button
                      key={type}
                      variant={formData.type === type ? 'primary' : 'outline'}
                      onPress={() => setField('type', type)}
                    >
                      {t(`inputs.type.options.${type}`)}
                    </Button>
                  ))}
                </div>
                {formData.type === ResourceType.DOOR ? <DoorTab {...editorProps} /> : <MachineTab {...editorProps} />}
              </div>
              {saveButton}
            </>
          ),
        },
        {
          key: 'metadata',
          title: t('topics.metadata.title'),
          description: t('topics.metadata.description'),
          icon: <Settings2Icon size={19} />,
          content: (
            <>
              <ResourceMetadataEditor
                t={t}
                value={formData.metadata}
                onChange={(value) => setField('metadata', value)}
              />
              {saveButton}
            </>
          ),
        },
      ],
    },
    {
      key: 'access',
      label: t('groups.access'),
      items: [
        {
          key: 'retraining',
          title: t('topics.retraining.title'),
          description: t('topics.retraining.description'),
          content: (
            <>
              <RetrainingTab {...editorProps} />
              {saveButton}
            </>
          ),
        },
        {
          key: 'supervision',
          title: t('topics.supervision.title'),
          description: t('topics.supervision.description'),
          content: (
            <>
              <SupervisionTab {...editorProps} />
              {saveButton}
            </>
          ),
        },
        {
          key: 'groups',
          title: t('topics.groups.title'),
          description: t('topics.groups.description'),
          icon: <FolderIcon size={19} />,
          to: `/resources/${resourceId}/groups`,
        },
        {
          key: 'forms',
          title: t('topics.forms.title'),
          description: t('topics.forms.description'),
          icon: <ListChecks size={19} />,
          to: `/resources/${resourceId}/forms`,
        },
      ],
    },
    {
      key: 'automation',
      label: t('groups.automation'),
      items: [
        {
          key: 'flows',
          title: t('topics.flows.title'),
          description: t('topics.flows.description'),
          icon: <WorkflowIcon size={19} />,
          to: `/resources/${resourceId}/flows`,
        },
        {
          key: 'diagnostics',
          title: t('topics.diagnostics.title'),
          description: t('topics.diagnostics.description'),
          icon: <StethoscopeIcon size={19} />,
          to: `/resources/${resourceId}/diagnostics`,
        },
      ],
    },
  ];

  return (
    <div data-cy="resource-settings-page">
      <PageHeader
        title={t('title', { name: resource.name })}
        subtitle={t('subtitle')}
        icon={<Settings2Icon size={20} />}
        backTo={`/resources/${resourceId}`}
      />
      <SettingsDirectory groups={groups} searchLabel={t('search')} emptyMessage={t('noResults')} />
    </div>
  );
}
