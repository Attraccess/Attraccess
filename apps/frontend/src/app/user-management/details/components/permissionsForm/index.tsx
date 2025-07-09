import React, { useEffect, useState } from 'react';
import { Checkbox, Button, Card, CardHeader, CardBody, CardFooter } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  User,
  useUsersServiceGetPermissions,
  useUsersServiceUpdatePermissions,
  UseUsersServiceFindManyKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../../../components/pageHeader';

import * as en from './en.json';
import * as de from './de.json';

interface UserPermissionFormProps {
  user: User;
}

export const UserPermissionForm: React.FC<UserPermissionFormProps> = ({ user }) => {
  const { t } = useTranslations('userPermissionForm', { en, de });
  const { showToast } = useToastMessage();
  const queryClient = useQueryClient();

  const { data: userPermissions, isLoading } = useUsersServiceGetPermissions({ id: user.id });
  const updatePermissions = useUsersServiceUpdatePermissions();

  const [permissions, setPermissions] = useState({
    canManageResources: false,
    canManageSystemConfiguration: false,
    canManageUsers: false,
  });

  // Update local state when permissions data is loaded
  useEffect(() => {
    if (userPermissions) {
      setPermissions({
        canManageResources: userPermissions.canManageResources ?? false,
        canManageSystemConfiguration: userPermissions.canManageSystemConfiguration ?? false,
        canManageUsers: userPermissions.canManageUsers ?? false,
      });
    }
  }, [userPermissions]);

  const handlePermissionChange = (permission: string) => (checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [permission]: checked,
    }));
  };

  const handleSave = async () => {
    try {
      await updatePermissions.mutateAsync({
        id: user.id,
        requestBody: permissions,
      });

      queryClient.invalidateQueries({
        queryKey: [UseUsersServiceFindManyKeyFn()[0]],
      });

      showToast({
        title: t('userPermissionsSaved'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error updating permissions:', error);
      showToast({
        title: t('errorUpdatingPermissions'),
        type: 'error',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4" data-cy="user-permission-form-loading">
        Loading permissions...
      </div>
    );
  }

  return (
    <Card data-cy="user-permission-form-card">
      <CardHeader>
        <PageHeader title={t('title')} noMargin />
      </CardHeader>

      <CardBody>
        <Checkbox
          isSelected={permissions.canManageResources}
          onValueChange={handlePermissionChange('canManageResources')}
          color="primary"
          data-cy="user-permission-form-canManageResources-checkbox"
        >
          {t('permissions.canManageResources')}
        </Checkbox>

        <Checkbox
          isSelected={permissions.canManageSystemConfiguration}
          onValueChange={handlePermissionChange('canManageSystemConfiguration')}
          color="primary"
          data-cy="user-permission-form-canManageSystemConfiguration-checkbox"
        >
          {t('permissions.canManageSystemConfiguration')}
        </Checkbox>

        <Checkbox
          isSelected={permissions.canManageUsers}
          onValueChange={handlePermissionChange('canManageUsers')}
          color="primary"
          data-cy="user-permission-form-canManageUsers-checkbox"
        >
          {t('permissions.canManageUsers')}
        </Checkbox>
      </CardBody>

      <CardFooter className="flex justify-end">
        <Button
          color="primary"
          onPress={handleSave}
          isLoading={updatePermissions.isPending}
          data-cy="user-permission-form-save-button"
        >
          {t('actions.save')}
        </Button>
      </CardFooter>
    </Card>
  );
};
