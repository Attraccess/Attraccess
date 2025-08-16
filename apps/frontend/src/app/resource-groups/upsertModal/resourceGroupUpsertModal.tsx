import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './resourceGroupUpsertModal.en.json';
import * as de from './resourceGroupUpsertModal.de.json';
import {
  ResourceGroup,
  useResourcesServiceResourceGroupsCreateOne,
  CreateResourceGroupDto,
  useResourcesServiceResourceGroupsUpdateOne,
  UpdateResourceGroupDto,
  useResourcesServiceResourceGroupsGetManyKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useToastMessage } from '../../../components/toastProvider';
import { useNavigate } from 'react-router-dom';

type FormData = CreateResourceGroupDto | UpdateResourceGroupDto;

// Define a more specific type for the expected error structure from the API
interface ApiValidationError {
  errors?: {
    [key: string]: string[];
  };
  message?: string; // General error message field
}

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  /** If provided, the modal will be in edit mode */
  resourceGroup?: ResourceGroup;
  onUpserted?: (resourceGroup: ResourceGroup) => void;
}

export function ResourceGroupUpsertModal(props: Readonly<Props>) {
  const { isOpen, onOpen, onOpenChange, onClose: closeDisclosure } = useDisclosure();
  const { t } = useTranslations('resourceGroupUpsertModal', {
    en,
    de,
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
  });
  const [apiErrors, setApiErrors] = useState<{ [key: string]: string[] | undefined }>({});

  const { success, error: showErrorToast } = useToastMessage();
  const queryClient = useQueryClient();
  const isEditMode = !!props.resourceGroup;
  const navigate = useNavigate();

  const handleSuccess = (createdOrUpdatedGroup: ResourceGroup) => {
    success({
      title: isEditMode ? t('successTitleUpdate') : t('successTitleCreate'),
      description: isEditMode
        ? t('successDescriptionUpdate', { name: createdOrUpdatedGroup.name })
        : t('successDescriptionCreate', { name: createdOrUpdatedGroup.name }),
    });

    if (typeof props.onUpserted === 'function') {
      props.onUpserted(createdOrUpdatedGroup);
    }

    queryClient.invalidateQueries({
      queryKey: [useResourcesServiceResourceGroupsGetManyKey],
    });

    if (!isEditMode) {
      setFormData({ name: '', description: '' });
    }
    setApiErrors({});
    closeDisclosure();
  };

  const handleError = (error: AxiosError<ApiValidationError>) => {
    console.error('Failed to upsert resource group:', error);
    const responseData = error.response?.data;
    const fieldErrors = responseData?.errors;

    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      setApiErrors(fieldErrors);
      showErrorToast({
        title: isEditMode ? t('errorTitleUpdate') : t('errorTitleCreate'),
        // Consider adding a specific translation for validation errors
        description: t('fieldValidationError') ?? 'Please check the form for errors.',
      });
    } else {
      setApiErrors({});
      showErrorToast({
        title: isEditMode ? t('errorTitleUpdate') : t('errorTitleCreate'),
        description: responseData?.message || (isEditMode ? t('errorDescriptionUpdate') : t('errorDescriptionCreate')),
      });
    }
  };

  // Pass onSuccess and onError directly to the hook options
  const createMutation = useResourcesServiceResourceGroupsCreateOne({
    onSuccess: (data) => {
      handleSuccess(data);
      navigate(`/resource-groups/${data.id}`);
    },
    onError: handleError,
  });

  const updateMutation = useResourcesServiceResourceGroupsUpdateOne({
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const mutation = isEditMode ? updateMutation : createMutation;

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && props.resourceGroup) {
        setFormData({
          name: props.resourceGroup.name,
          description: props.resourceGroup.description ?? '',
        });
      } else {
        // Reset form for create mode or when no resource group is provided
        setFormData({ name: '', description: '' });
      }
      setApiErrors({}); // Clear errors when modal opens
    }
  }, [isEditMode, props.resourceGroup, isOpen]);

  useEffect(() => {
    if (isOpen) {
      nameInputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setApiErrors({});

      // Prepare the data in the format expected by the mutation
      const requestBody = {
        name: formData.name,
        description: formData.description,
      };

      if (isEditMode && props.resourceGroup) {
        // Ensure types match for update mutation
        updateMutation.mutate({
          id: props.resourceGroup.id,
          requestBody: requestBody as UpdateResourceGroupDto,
        });
      } else {
        // Ensure types match for create mutation
        createMutation.mutate({
          requestBody: requestBody as CreateResourceGroupDto,
        });
      }
    },
    // Dependencies should include the specific mutations if used directly
    [isEditMode, props.resourceGroup, formData, createMutation, updateMutation]
  );

  const getFieldError = (fieldName: keyof FormData) => {
    return apiErrors[fieldName]?.[0];
  };

  return (
    <>
      {props.children(onOpen)}
      <Modal
        isOpen={isOpen}
        placement="top-center"
        onOpenChange={onOpenChange}
        scrollBehavior="inside"
        data-cy="resource-group-upsert-modal"
      >
        <ModalContent>
          {(onClose) => (
            <Form onSubmit={handleSubmit}>
              <ModalHeader>{isEditMode ? t('modalTitleUpdate') : t('modalTitleCreate')}</ModalHeader>

              <ModalBody className="w-full space-y-4">
                <Input
                  ref={nameInputRef}
                  isRequired
                  label={t('nameLabel')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  // Use isInvalid prop for error state
                  isInvalid={!!getFieldError('name')}
                  errorMessage={getFieldError('name')}
                  // Clear specific error when user types
                  onKeyDown={() => setApiErrors((prev) => ({ ...prev, name: undefined }))}
                  data-cy="resource-group-name-input"
                />
                <Input
                  label={t('descriptionLabel')}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  isInvalid={!!getFieldError('description')}
                  errorMessage={getFieldError('description')}
                  onKeyDown={() => setApiErrors((prev) => ({ ...prev, description: undefined }))}
                  data-cy="resource-group-description-input"
                />
              </ModalBody>

              <ModalFooter>
                <Button
                  variant="flat"
                  color="default"
                  onPress={onClose}
                  data-cy="resource-group-upsert-modal-cancel-button"
                >
                  {t('cancelButton')}
                </Button>
                {/* Use the general mutation.isPending state */}
                <Button
                  color="primary"
                  type="submit"
                  isLoading={mutation.isPending}
                  data-cy="resource-group-upsert-modal-submit-button"
                >
                  {isEditMode ? t('updateButton') : t('createButton')}
                </Button>
              </ModalFooter>
            </Form>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
