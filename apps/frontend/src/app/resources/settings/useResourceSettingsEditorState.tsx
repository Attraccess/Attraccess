import { useCallback, useEffect, useRef, useState } from 'react';
import {
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceUpdateOneResource,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import editorEn from '../editModal/resourceEditModal.en.json';
import editorDe from '../editModal/resourceEditModal.de.json';
import en from './en.json';
import de from './de.json';
import { FormData } from './ResourceSettingsPage.form-data';
import { fromResource } from './ResourceSettingsPage.from-resource';
export function useResourceSettingsEditorState({ resourceId }: { resourceId: number }) {
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
  return {
    t,
    resource,
    isLoading,
    error,
    formData,
    setSelectedImage,
    setDeleteImage,
    dirty,
    setDirty,
    editRevision,
    setField,
    updateResource,
    save,
    resourceId,
  } as const;
}
