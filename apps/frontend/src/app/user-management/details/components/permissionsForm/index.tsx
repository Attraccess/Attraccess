import React, { useEffect, useState } from 'react';
import { Button, Card, CardHeader, CardBody, CardFooter, Switch } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  ApiError,
  User,
  useUsersServiceGetPermissions,
  useUsersServiceUpdatePermissions,
  SystemPermissions,
  useUsersServiceFindManyKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../../../components/pageHeader';

import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';

interface UserPermissionFormProps {
  user: User;
}

export const UserPermissionForm: React.FC<UserPermissionFormProps> = ({ user }) => {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: userPermissions, isLoading } = useUsersServiceGetPermissions({ id: user.id });
  const { mutateAsync: savePermissions, isPending: isSavingPermissions } = useUsersServiceUpdatePermissions({
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
      });

      toast.success({
        title: t('messages.updated'),
      });
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
    },
  });

  const [permissions, setPermissions] = useState<Record<keyof SystemPermissions, boolean>>({
    canManageResources: false,
    canManageSystemConfiguration: false,
    canManageUsers: false,
    canManageBilling: false,
  });

  // Update local state when permissions data is loaded
  useEffect(() => {
    if (userPermissions) {
      setPermissions({
        canManageResources: userPermissions.canManageResources ?? false,
        canManageSystemConfiguration: userPermissions.canManageSystemConfiguration ?? false,
        canManageUsers: userPermissions.canManageUsers ?? false,
        canManageBilling: userPermissions.canManageBilling ?? false,
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
    await savePermissions({
      id: user.id,
      requestBody: permissions,
    }).catch(() => {
      // Error handling is performed in onError above.
    });
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

      <CardBody className="flex flex-col gap-2">
        {Object.keys(permissions).map((permission) => (
          <Switch
            key={permission}
            isSelected={permissions[permission as keyof SystemPermissions]}
            onValueChange={handlePermissionChange(permission as keyof SystemPermissions)}
            color="primary"
            data-cy={`user-permission-form-${permission}-checkbox`}
          >
            {t(`permissions.${permission}`)}
          </Switch>
        ))}
      </CardBody>

      <CardFooter className="flex justify-end">
        <Button
          color="primary"
          onPress={handleSave}
          isLoading={isSavingPermissions}
          data-cy="user-permission-form-save-button"
        >
          {t('actions.save')}
        </Button>
      </CardFooter>
    </Card>
  );
};
