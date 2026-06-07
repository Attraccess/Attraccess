import { useState, useEffect, useCallback, HTMLAttributes } from 'react';
import { Form, Input, Label, Spinner, TextArea, TextField } from '@heroui/react';
import { Button } from '../../../components/button';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { Save, Edit3, Trash2Icon } from 'lucide-react';
import {
  useResourcesServiceResourceGroupsGetOne,
  useResourcesServiceResourceGroupsUpdateOne,
  UseResourcesServiceResourceGroupsGetOneKeyFn,
  useResourcesServiceResourceGroupsDeleteOne,
  UseResourcesServiceResourceGroupsGetManyKeyFn,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useNavigate } from 'react-router-dom';

interface GroupDetailsFormProps {
  groupId: number;
}

export function GroupDetailsForm(props: Readonly<GroupDetailsFormProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'>>) {
  const { groupId, className, ...rest } = props;

  const { t } = useTranslations({ en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const navigate = useNavigate();

  const { data: group, isLoading, error } = useResourcesServiceResourceGroupsGetOne({ id: groupId });

  const { mutateAsync: updateGroup, isPending: isUpdating } = useResourcesServiceResourceGroupsUpdateOne({
    onSuccess: () => {
      success({
        title: t('operations.update.success.title'),
        description: t('operations.update.success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceGroupsGetOneKeyFn({ id: groupId }),
      });
    },
    onError: (err: Error) => {
      showError({
        title: t('operations.update.error.title'),
        description: t('operations.update.error.description', { error: err.message }),
      });
    },
  });

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || '');
      setIsHidden(group.isHidden ?? false);
    }
  }, [group]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await updateGroup({
      id: groupId,
      requestBody: { name: name.trim(), description: description.trim() || undefined, isHidden },
    });
  };

  const { isPending: isDeleting, mutate: deleteGroupMutation } = useResourcesServiceResourceGroupsDeleteOne({
    onSuccess: () => {
      success({
        title: t('operations.delete.success.title'),
        description: t('operations.delete.success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceGroupsGetManyKeyFn(),
      });
      navigate('/');
    },
    onError: (err: Error) => {
      showError({
        title: t('operations.delete.error.title'),
        description: t('operations.delete.error.description', { error: err.message }),
      });
    },
  });

  const handleDelete = useCallback(() => {
    deleteGroupMutation({
      groupId,
    });
  }, [deleteGroupMutation, groupId]);

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  if (isLoading) {
    return (
      <div className={className} {...rest} data-cy="group-details-form-loading">
        <div className="flex items-center justify-center py-8">
          <Spinner />
          <span className="ml-2 opacity-70">{t('states.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className={className} {...rest} data-cy="group-details-form-error">
        <div className="flex items-center gap-3">
          <Edit3 size={20} color="red" />
          <div>
            <p className="text-danger font-medium">{t('errors.load.title')}</p>
            <p className="text-sm opacity-70">{t('errors.load.description')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className} {...rest} data-cy="group-details-form">
      <Form onSubmit={handleSubmit} className="gap-6 w-full" data-cy="group-details-form-form">
        <section className="w-full flex flex-col gap-4">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.details')}</h3>

          <TextField value={name} onChange={setName} isRequired className="w-full">
            <Label>{t('form.fields.name.label')}</Label>
            <Input
              placeholder={t('form.fields.name.placeholder')}
              data-cy="group-details-form-name-input"
            />
          </TextField>

          <TextArea
            placeholder={t('form.fields.description.placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-cy="group-details-form-description-input"
          />
        </section>

        <section className="w-full flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.visibility')}
          </h3>

          <LabeledSwitch
            isSelected={isHidden}
            onChange={setIsHidden}
            data-cy="group-details-form-is-hidden-switch"
          >
            <span className="text-small">{t('form.fields.isHidden.label')}</span>
          </LabeledSwitch>
          <span className="text-tiny text-default-400">{t('form.fields.isHidden.description')}</span>
        </section>

        <div className="flex flex-col gap-2 w-full">
          <Button
            variant="primary"
            type="submit"
            isPending={isUpdating}
            isDisabled={!name.trim() || isUpdating}
            className="w-full"
            data-cy="group-details-form-save-button"
          >
            <Save size={16} />
            {t('form.buttons.save')}
          </Button>

          <Button
            variant="danger"
            className="w-full"
            onPress={() => setShowDeleteConfirmation(true)}
            data-cy="group-details-form-delete-button"
          >
            <Trash2Icon className="w-4 h-4" />
            {t('form.buttons.delete')}
          </Button>
        </div>

        <DeleteConfirmationModal
          isOpen={showDeleteConfirmation}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={() => handleDelete()}
          itemName={group.name}
          isDeleting={isDeleting}
        />
      </Form>
    </div>
  );
}
