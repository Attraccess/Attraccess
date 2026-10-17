import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk/v2';
import type {
  PluginContext as NeutralPluginContext,
  PluginHostOperations,
  PluginPersistenceContext,
} from '@attraccess/plugins-backend-sdk/v2';

/** Shared capabilities have already been guarded by the legacy sandbox. No ORM access is copied. */
export function createNeutralGuardedContext(
  base: Omit<NeutralPluginContext, 'operations' | 'persistence'>,
  declared: PluginPermission[],
  operations: PluginHostOperations,
  persistence: PluginPersistenceContext,
): NeutralPluginContext {
  const granted = new Set(declared);
  const requirePermission = (permission: PluginPermission, capability: string): void => {
    if (!granted.has(permission)) throw new PluginPermissionError(base.manifest.name, capability, permission);
  };
  return {
    manifest: base.manifest,
    audit: base.audit,
    liveUpdates: base.liveUpdates,
    logger: base.logger,
    mqtt: base.mqtt,
    events: base.events,
    onEvent: (event, handler) => base.onEvent(event, handler),
    emitEvent: (event, payload) => base.emitEvent(event, payload),
    getMqttServerConfig: (id) => base.getMqttServerConfig(id),
    getMqttCredentialProvisioning: () => base.getMqttCredentialProvisioning(),
    get flows() {
      return base.flows;
    },
    get secrets() {
      return base.secrets;
    },
    operations: {
      users: {
        list(input) {
          requirePermission(PluginPermission.READ_USERS, 'operations.users.list');
          return operations.users.list(input);
        },
      },
      resources: {
        findById(id) {
          requirePermission(PluginPermission.ACCESS_RESOURCES, 'operations.resources.findById');
          return operations.resources.findById(id);
        },
      },
      flows: {
        findReferences(input) {
          requirePermission(PluginPermission.ACCESS_RESOURCES, 'operations.flows.findReferences');
          return operations.flows.findReferences(input);
        },
      },
      settings: {
        findByKey(input) {
          requirePermission(PluginPermission.READ_SETTINGS, 'operations.settings.findByKey');
          return operations.settings.findByKey(input);
        },
      },
    },
    persistence: {
      resolve(token) {
        requirePermission(PluginPermission.DATABASE_ACCESS, 'persistence.resolve');
        return persistence.resolve(token);
      },
    },
  };
}
