import { useState, useEffect, useCallback, HTMLAttributes } from 'react';
import {
  useAccessControlServiceResourceIntroductionsGetPeopleKey,
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
import { useNavigate } from 'react-router-dom';
import type { GroupDetailsFormProps } from './index';

export function useGroupDetailsFormState(
  props: Readonly<GroupDetailsFormProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'>>,
) {
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
      queryClient.invalidateQueries({ queryKey: [useAccessControlServiceResourceIntroductionsGetPeopleKey] });
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
      queryClient.invalidateQueries({ queryKey: [useAccessControlServiceResourceIntroductionsGetPeopleKey] });
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
  return {
    className,
    rest,
    t,
    name,
    setName,
    description,
    setDescription,
    isHidden,
    setIsHidden,
    group,
    isLoading,
    error,
    isUpdating,
    handleSubmit,
    isDeleting,
    handleDelete,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
  } as const;
}
