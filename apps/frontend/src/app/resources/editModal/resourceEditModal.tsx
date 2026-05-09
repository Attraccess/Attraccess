import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading, Tab, Tabs, useOverlayState } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './resourceEditModal.en.json';
import de from './resourceEditModal.de.json';
import {
  useResourcesServiceUpdateOneResource,
  UpdateResourceDto,
  Resource,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceCreateOneResource,
  ResourceType,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { SharedDataTab } from './tabs/shared';
import { MachineTab } from './tabs/machine';
import { DoorTab } from './tabs/door';
import { ResourceMetadataEditor } from './resourceMetadataEditor';

type ResourceFormData = Omit<UpdateResourceDto, 'metadata'> & {
  metadata: Record<string, unknown>;
};

interface ResourceEditModalProps {
  resourceId?: Resource['id'];
  onUpdated?: (resource: Resource) => void;
  children?: (onOpen: () => void) => React.ReactNode;
  closeOnSuccess?: boolean;
}

export function ResourceEditModal(props: ResourceEditModalProps) {
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { t } = useTranslations({
    en,
    de,
  });
  const { isOpen, open, setOpen, close } = useOverlayState();

  const formRef = useRef<HTMLFormElement>(null);

  const [deleteImage, setDeleteImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null | undefined>(undefined);
  const [formData, setFormData] = useState<ResourceFormData>({
    name: '',
    description: '',
    allowTakeOver: false,
    type: ResourceType.MACHINE,
    separateUnlockAndUnlatch: false,
    metadata: {} as Record<string, unknown>,
  });

  const setField = useCallback(
    <T extends keyof ResourceFormData>(field: T, value: ResourceFormData[T]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [setFormData],
  );

  const onUpsertSuccess = useCallback(
    (upsertedResource: Resource) => {
      if (typeof props.onUpdated === 'function') {
        props.onUpdated(upsertedResource);
      }

      queryClient.invalidateQueries({
        queryKey: [useResourcesServiceGetAllResourcesKey],
      });

      if (props.resourceId) {
        queryClient.invalidateQueries({
          queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: props.resourceId }),
        });
      }

      if (props.closeOnSuccess) {
        close();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onUpdated, props.resourceId, queryClient],
  );

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: props.resourceId as number }, undefined, {
    enabled: !!props.resourceId,
  });
  const updateResource = useResourcesServiceUpdateOneResource({
    onSuccess: (updatedResource) => {
      toast.success({
        title: t('update.success.toast.title'),
        description: t('update.success.toast.description', { name: updatedResource.name }),
      });

      onUpsertSuccess(updatedResource);
    },
    onError: (error) => {
      toast.error({
        title: t('update.error.toast.title'),
        description: t('update.error.toast.description') + ' ' + (error as Error).message,
      });

      console.error('Failed to update resource:', error, {
        resourceId: props.resourceId,
        error: updateResource.error,
        requestData: formData,
      });
    },
  });
  const createResource = useResourcesServiceCreateOneResource({
    onSuccess: (createdResource) => {
      toast.success({
        title: t('create.success.toast.title'),
        description: t('create.success.toast.description', { name: createdResource.name }),
      });

      onUpsertSuccess(createdResource);
    },
    onError: (error) => {
      toast.error({
        title: t('create.error.toast.title'),
        description: t('create.error.toast.description') + ' ' + (error as Error).message,
      });

      console.error('Failed to create resource:', error, {
        resourceId: props.resourceId,
        error: createResource.error,
        requestData: formData,
      });
    },
  });

  const clearForm = useCallback(() => {
    setFormData({
      name: resource?.name || '',
      description: resource?.description || '',
      allowTakeOver: resource?.allowTakeOver || false,
      type: resource?.type || ResourceType.MACHINE,
      separateUnlockAndUnlatch: resource?.separateUnlockAndUnlatch || false,
      metadata: (resource?.metadata ?? {}) as Record<string, unknown>,
    });
    setSelectedImage(null);
  }, [resource, setFormData, setSelectedImage]);

  const onImageSelected = useCallback((file: File | null) => {
    setSelectedImage(file);
    setDeleteImage(file === null);
  }, []);

  // Update form data when resource changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    clearForm();
  }, [clearForm, isOpen]);

  const onSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) {
      return;
    }

    if (props.resourceId) {
      updateResource.mutate({
        id: props.resourceId,
        formData: {
          name: formData.name,
          description: formData.description,
          allowTakeOver: formData.allowTakeOver,
          image: selectedImage ?? undefined,
          deleteImage,
          type: formData.type,
          separateUnlockAndUnlatch: formData.separateUnlockAndUnlatch,
          metadata: formData.metadata as Record<string, unknown>,
        },
      });
      return;
    }

    createResource.mutate({
      formData: {
        name: formData.name as string,
        description: formData.description as string,
        allowTakeOver: formData.allowTakeOver,
        image: selectedImage ?? undefined,
        type: formData.type as ResourceType,
        separateUnlockAndUnlatch: formData.separateUnlockAndUnlatch,
        metadata: formData.metadata as Record<string, unknown>,
      },
    });
  }, [formData, selectedImage, props.resourceId, updateResource, createResource, deleteImage]);

  return (
    <>
      {props.children?.(open)}
      <Modal
        isOpen={isOpen}
        onOpenChange={setOpen}
        data-cy="resource-edit-modal"
      >
        <ModalBackdrop />
        <ModalContainer size="full">
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <ModalHeading>{t(`modalTitle.${props.resourceId ? 'update' : 'create'}`)}</ModalHeading>
                </ModalHeader>

                <ModalBody className="w-full space-y-4">
                  <Form
                    ref={formRef}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmit();
                    }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full"
                  >
                    <div className="flex flex-col gap-2 w-full">
                      <SharedDataTab
                        t={t}
                        formData={formData}
                        setField={setField}
                        onImageSelected={onImageSelected}
                        resource={resource}
                      />
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      <Tabs
                        onSelectionChange={(key) => setField('type', key as UpdateResourceDto['type'])}
                        selectedKey={formData.type}
                        destroyInactiveTabPanel={false}
                      >
                        <Tab key="machine" title={t('inputs.type.options.machine')}>
                          <MachineTab t={t} formData={formData} setField={setField} />
                        </Tab>
                        <Tab key="door" title={t('inputs.type.options.door')}>
                          <DoorTab t={t} formData={formData} setField={setField} />
                        </Tab>
                      </Tabs>
                    </div>

                    <div className="lg:col-span-2">
                      <ResourceMetadataEditor
                        t={t}
                        value={formData.metadata}
                        onChange={(value) => setField('metadata', value)}
                      />
                    </div>
                  </Form>
                </ModalBody>

                <ModalFooter className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full">
                  <Button variant="outline"
                    className="w-full sm:w-auto min-w-full sm:min-w-fit"
                    onPress={close}
                    data-cy="resource-edit-modal-cancel-button"
                  >
                    {t('buttons.cancel')}
                  </Button>
                  <Button variant="primary"
                    className="w-full sm:w-auto min-w-full sm:min-w-fit"
                    onPress={onSubmit}
                    data-cy={`resource-edit-modal-${props.resourceId ? 'update' : 'create'}-button`}
                  >
                    {props.resourceId ? t('buttons.update') : t('buttons.create')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
