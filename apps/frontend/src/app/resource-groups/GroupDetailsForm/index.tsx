import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardBody, Input, Textarea, Button, Spinner, CardProps } from '@heroui/react';
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
import { PageHeader } from '../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useNavigate } from 'react-router-dom';

interface GroupDetailsFormProps {
  groupId: number;
}

export function GroupDetailsForm(props: Readonly<GroupDetailsFormProps & Omit<CardProps, 'children'>>) {
  const { groupId, ...rest } = props;

  const { t } = useTranslations({ en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
    }
  }, [group]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await updateGroup({
      id: groupId,
      requestBody: { name: name.trim(), description: description.trim() || undefined },
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
      <Card {...rest}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
            <Spinner size="sm" />
            <span style={{ marginLeft: '8px', opacity: 0.7 }}>{t('states.loading')}</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error || !group) {
    return (
      <Card {...rest}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Edit3 size={20} color="red" />
            <div>
              <p style={{ color: 'red', fontWeight: '500' }}>{t('errors.load.title')}</p>
              <p style={{ fontSize: '14px', opacity: 0.7 }}>{t('errors.load.description')}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card {...rest}>
      <CardHeader>
        <PageHeader title={t('form.title')} subtitle={t('form.subtitle')} icon={<Edit3 size={20} />} noMargin={true} />
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label={t('form.fields.name.label')}
            placeholder={t('form.fields.name.placeholder')}
            value={name}
            onValueChange={setName}
            isRequired
          />

          <Textarea
            label={t('form.fields.description.label')}
            placeholder={t('form.fields.description.placeholder')}
            value={description}
            onValueChange={setDescription}
            minRows={3}
          />

          <Button
            type="submit"
            color="primary"
            startContent={<Save size={16} />}
            isLoading={isUpdating}
            isDisabled={!name.trim() || isUpdating}
            className="w-full"
          >
            {t('form.buttons.save')}
          </Button>

          <Button
            className="w-full"
            color="danger"
            startContent={<Trash2Icon className="w-4 h-4" />}
            onPress={() => setShowDeleteConfirmation(true)}
          >
            {t('form.buttons.delete')}
          </Button>

          <DeleteConfirmationModal
            isOpen={showDeleteConfirmation}
            onClose={() => setShowDeleteConfirmation(false)}
            onConfirm={() => handleDelete()}
            itemName={group.name}
            isDeleting={isDeleting}
          />
        </form>
      </CardBody>
    </Card>
  );
}
