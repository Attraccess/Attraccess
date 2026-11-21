import { definePluginPermissions } from '@attraccess/plugins-backend-sdk';
import { STATUS_WALL_MANAGE } from './permission-keys';

export const STATUS_WALL_PERMISSIONS = definePluginPermissions({
  category: { en: 'Status walls', de: 'Statuswände' },
  permissions: [
    {
      key: STATUS_WALL_MANAGE,
      label: { en: 'Manage status walls', de: 'Statuswände verwalten' },
      description: {
        en: 'Create, change and delete status walls and see their public links',
        de: 'Statuswände anlegen, ändern und löschen und ihre öffentlichen Links sehen',
      },
      defaultRoles: ['administrator', 'resource-manager'],
    },
  ],
});

export const STATUS_WALL_MANAGE_PERMISSION = STATUS_WALL_PERMISSIONS.keys[STATUS_WALL_MANAGE];
