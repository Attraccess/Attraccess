import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './resourceEditModal.en.json';
import * as de from './resourceEditModal.de.json';
import {
  useResourcesServiceUpdateOneResource,
  UpdateResourceDto,
  UseResourcesServiceGetAllResourcesKeyFn,
  Resource,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceCreateOneResource,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ImageUpload } from '../../../components/imageUpload';
import { useToastMessage } from '../../../components/toastProvider';
import { filenameToUrl } from '../../../api';

interface ResourceEditModalProps {
  resourceId?: Resource['id'];
  onUpdated?: (resource: Resource) => void;
  children?: (onOpen: () => void) => React.ReactNode;
  closeOnSuccess?: boolean;
}

export function ResourceEditModal(props: ResourceEditModalProps) {
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { t } = useTranslations('resourceEditModal', {
    en,
    de,
  });
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const formRef = useRef<HTMLFormElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null | undefined>(undefined);
  const [formData, setFormData] = useState<UpdateResourceDto>({
    name: '',
    description: '',
    allowTakeOver: false,
  });

  const setField = useCallback(
    <T extends keyof UpdateResourceDto>(field: T, value: UpdateResourceDto[T]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [setFormData]
  );

  const onUpsertSuccess = useCallback(
    (upsertedResource: Resource) => {
      if (typeof props.onUpdated === 'function') {
        props.onUpdated(upsertedResource);
      }

      queryClient.invalidateQueries({
        queryKey: [UseResourcesServiceGetAllResourcesKeyFn()[0]],
      });

      if (props.resourceId) {
        queryClient.invalidateQueries({
          queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: props.resourceId }),
        });
      }

      if (props.closeOnSuccess) {
        onClose();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onUpdated, props.resourceId, queryClient]
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
    if (resource) {
      setFormData({
        name: resource.name,
        description: resource.description || '',
        allowTakeOver: resource.allowTakeOver || false,
      });
    } else {
      // Fallback if resource is somehow not available, though it's a required prop
      setFormData({
        name: '',
        description: '',
        allowTakeOver: false,
      });
    }
    setSelectedImage(null);
  }, [resource, setFormData, setSelectedImage]);

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
          deleteImage: selectedImage === null,
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
      },
    });
  }, [formData, selectedImage, props.resourceId, updateResource, createResource]);

  return (
    <>
      {props.children?.(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside" data-cy="resource-edit-modal">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t(`modalTitle.${props.resourceId ? 'update' : 'create'}`)}</ModalHeader>

              <ModalBody className="w-full space-y-4">
                <Form
                  ref={formRef}
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                  }}
                >
                  <Input
                    isRequired
                    label={t('inputs.name.label')}
                    value={formData.name}
                    onChange={(e) => setField('name', e.target.value)}
                    isInvalid={!formData.name}
                    required
                    data-cy="resource-edit-modal-name-input"
                  />
                  <Input
                    label={t('inputs.description.label')}
                    value={formData.description}
                    onChange={(e) => setField('description', e.target.value)}
                    data-cy="resource-edit-modal-description-input"
                  />

                  <Switch
                    isSelected={formData.allowTakeOver}
                    onValueChange={(value) => setField('allowTakeOver', value)}
                    data-cy="resource-edit-modal-allow-takeover-switch"
                  >
                    <div className="flex flex-col">
                      <span className="text-small">{t('inputs.allowTakeOver.label')}</span>
                      <span className="text-tiny text-default-400">{t('inputs.allowTakeOver.description')}</span>
                    </div>
                  </Switch>

                  <ImageUpload
                    label={t('inputs.image.label')}
                    id="image"
                    onChange={setSelectedImage}
                    className="w-full"
                    currentImageUrl={resource?.imageFilename ? filenameToUrl(resource?.imageFilename) : undefined}
                  />

                  <button hidden type="submit" />
                </Form>
              </ModalBody>

              <ModalFooter className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full">
                <Button
                  variant="bordered"
                  className="w-full sm:w-auto min-w-full sm:min-w-fit"
                  onPress={onClose}
                  data-cy="resource-edit-modal-cancel-button"
                >
                  {t('buttons.cancel')}
                </Button>
                <Button
                  color="primary"
                  className="w-full sm:w-auto min-w-full sm:min-w-fit"
                  onPress={onSubmit}
                  data-cy={`resource-edit-modal-${props.resourceId ? 'update' : 'create'}-button`}
                >
                  {props.resourceId ? t('buttons.update') : t('buttons.create')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
