// The two permission tiers of the RabbitMQ plugin, declared as the plugin's own keys (ATT-1003). Every route, the
// capabilities answer and the tests reference these constants. The default roles keep the access system roles had
// when both tiers reused core keys (view = resources.update, manage = system.settings.manage); custom roles get the
// keys only when an administrator grants them.
import { definePluginPermissions } from '@attraccess/plugins-backend-sdk';
import { RABBITMQ_BROKER_MANAGE, RABBITMQ_BROKER_READ } from './permission-keys';

export const RABBITMQ_PERMISSIONS = definePluginPermissions({
  category: { en: 'RabbitMQ', de: 'RabbitMQ' },
  permissions: [
    {
      // View tier — detection/status, user list, connections list and broker stats.
      key: RABBITMQ_BROKER_READ,
      label: { en: 'View RabbitMQ broker', de: 'RabbitMQ-Broker anzeigen' },
      description: {
        en: 'View the RabbitMQ detection, broker users, connections and statistics',
        de: 'RabbitMQ-Erkennung, Broker-Benutzer, Verbindungen und Statistiken anzeigen',
      },
      defaultRoles: ['administrator', 'resource-manager', 'system-admin'],
    },
    {
      // Manage tier — everything that changes the broker: user create/update/delete, permissions and closing
      // connections. The live MQTT message explorer is not part of the plugin: it is a core feature for every broker.
      key: RABBITMQ_BROKER_MANAGE,
      label: { en: 'Manage RabbitMQ broker', de: 'RabbitMQ-Broker verwalten' },
      description: {
        en: 'Create, change and delete broker users and their permissions, and close connections',
        de: 'Broker-Benutzer und deren Berechtigungen anlegen, ändern und löschen sowie Verbindungen schließen',
      },
      defaultRoles: ['administrator', 'system-admin'],
    },
  ],
});

export const RABBITMQ_VIEW_PERMISSION = RABBITMQ_PERMISSIONS.keys[RABBITMQ_BROKER_READ];

export const RABBITMQ_MANAGE_PERMISSION = RABBITMQ_PERMISSIONS.keys[RABBITMQ_BROKER_MANAGE];
