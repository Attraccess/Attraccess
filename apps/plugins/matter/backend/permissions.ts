// The Matter and Thread permissions (ATT-1003): the keys this plugin declares, and the minimum key(s) of every
// operation. Every route, the frontend page and the tests read the map below, so a route never names a key itself.
//
// Each operation lists the keys it requires; a user needs ALL of them. Operations without a route yet (commissioning,
// direct commands, Thread, OTA, development overrides, live topics) are listed so the tickets that add them
// (ATT-1002, ATT-1011, ATT-1012, ATT-1015, ATT-997) apply these keys instead of choosing new ones.
//
// Flow-executed device commands are not listed: they stay under the normal flow and resource authorization. Only
// direct commands from the admin UI or API need `matter.devices.command-direct`.
import { definePluginPermissions, type PermissionKey } from '@attraccess/plugins-backend-sdk';
import {
  MATTER_DEVICES_COMMAND_DIRECT,
  MATTER_DEVICES_COMMISSION,
  MATTER_DEVICES_MANAGE,
  MATTER_DEVICES_READ,
  THREAD_NETWORK_MANAGE,
  THREAD_NETWORK_READ,
} from './permission-keys';

// D2: administrators and resource managers get every key on first registration; system-admin gets none.
const DEFAULT_ROLES = ['administrator', 'resource-manager'] as const;

export const MATTER_PERMISSIONS = definePluginPermissions({
  category: { en: 'Matter & Thread', de: 'Matter & Thread' },
  permissions: [
    {
      key: MATTER_DEVICES_READ,
      label: { en: 'View Matter devices', de: 'Matter-Geräte anzeigen' },
      description: {
        en: 'View the Matter connection status, fabric and backup status, devices, endpoints and their state',
        de: 'Verbindungsstatus, Fabric- und Backup-Status, Geräte, Endpunkte und deren Zustand von Matter anzeigen',
      },
      defaultRoles: DEFAULT_ROLES,
    },
    {
      key: MATTER_DEVICES_MANAGE,
      label: { en: 'Manage Matter devices', de: 'Matter-Geräte verwalten' },
      description: {
        en: 'Change the sidecar connection, create the fabric, manage the recovery key, create, download and restore backups, and claim, repair or remove devices. Full control of the fabric; grant it together with "View Matter devices"',
        de: 'Sidecar-Verbindung ändern, Fabric anlegen, Wiederherstellungsschlüssel verwalten, Backups erstellen, herunterladen und wiederherstellen sowie Geräte übernehmen, reparieren oder entfernen. Volle Kontrolle über die Fabric; zusammen mit „Matter-Geräte anzeigen“ vergeben',
      },
      defaultRoles: DEFAULT_ROLES,
    },
    {
      key: MATTER_DEVICES_COMMISSION,
      label: { en: 'Commission Matter devices', de: 'Matter-Geräte in Betrieb nehmen' },
      description: {
        en: 'Add devices to the fabric, share them with other controllers and remove them from the fabric',
        de: 'Geräte zur Fabric hinzufügen, mit anderen Controllern teilen und aus der Fabric entfernen',
      },
      defaultRoles: DEFAULT_ROLES,
    },
    {
      key: MATTER_DEVICES_COMMAND_DIRECT,
      label: { en: 'Send direct Matter commands', de: 'Direkte Matter-Befehle senden' },
      description: {
        en: 'Send test commands to a device outside of flows; unlock, unbolt and power-on ask for confirmation',
        de: 'Testbefehle außerhalb von Flows an ein Gerät senden; Entriegeln, Riegel zurückziehen und Einschalten verlangen eine Bestätigung',
      },
      defaultRoles: DEFAULT_ROLES,
    },
    {
      key: THREAD_NETWORK_READ,
      label: { en: 'View Thread network', de: 'Thread-Netzwerk anzeigen' },
      description: {
        en: 'View the Thread network status and dataset metadata, without its secrets',
        de: 'Status und Dataset-Metadaten des Thread-Netzwerks anzeigen, ohne dessen Geheimnisse',
      },
      defaultRoles: DEFAULT_ROLES,
    },
    {
      key: THREAD_NETWORK_MANAGE,
      label: { en: 'Manage Thread network', de: 'Thread-Netzwerk verwalten' },
      description: {
        en: 'Set the Thread dataset, manage border routers and export the dataset secrets (session login only)',
        de: 'Thread-Dataset festlegen, Border-Router verwalten und die Dataset-Geheimnisse exportieren (nur mit Sitzungsanmeldung)',
      },
      defaultRoles: DEFAULT_ROLES,
    },
  ],
});

const KEYS = MATTER_PERMISSIONS.keys;
export const MATTER_READ = KEYS[MATTER_DEVICES_READ];
export const MATTER_MANAGE = KEYS[MATTER_DEVICES_MANAGE];
export const MATTER_COMMISSION = KEYS[MATTER_DEVICES_COMMISSION];
export const MATTER_COMMAND_DIRECT = KEYS[MATTER_DEVICES_COMMAND_DIRECT];
export const THREAD_READ = KEYS[THREAD_NETWORK_READ];
export const THREAD_MANAGE = KEYS[THREAD_NETWORK_MANAGE];

/** Operation → the keys it requires (all of them). Apply with `@Auth(...MATTER_OPERATIONS.x)`. */
export const MATTER_OPERATIONS = {
  // Existing routes: status views (D4).
  connectionStatus: [MATTER_READ],
  fabricStatus: [MATTER_READ],
  backupList: [MATTER_READ],
  nodeList: [MATTER_READ],
  nodeGet: [MATTER_READ],
  endpointState: [MATTER_READ],
  reconciliationStatus: [MATTER_READ],

  // Existing routes: settings, fabric, recovery key, backup and restore (D4).
  /** The settings form (URL and CA). The credential is never returned. */
  connectionSettings: [MATTER_MANAGE],
  connectionSave: [MATTER_MANAGE],
  connectionRemove: [MATTER_MANAGE],
  /** "Retry now": reconnect to the sidecar at once with the saved settings (ATT-997). */
  connectionReconnect: [MATTER_MANAGE],
  fabricCreate: [MATTER_MANAGE],
  recoveryKeyGenerate: [MATTER_MANAGE],
  recoveryKeyAcknowledge: [MATTER_MANAGE],
  recoveryKeyRotate: [MATTER_MANAGE],
  recoveryAcceptSidecar: [MATTER_MANAGE],
  recoveryStartNew: [MATTER_MANAGE],
  backupCreate: [MATTER_MANAGE],
  /** Returns the encrypted backup. Scoped API tokens may use it (D9). */
  backupDownload: [MATTER_MANAGE],
  restoreValidate: [MATTER_MANAGE],
  restoreConfirm: [MATTER_MANAGE],
  restoreCancel: [MATTER_MANAGE],

  // Existing routes: device lifecycle.
  nodeUpdate: [MATTER_MANAGE],
  nodeClaim: [MATTER_MANAGE],
  nodeRelink: [MATTER_MANAGE],
  nodeRepair: [MATTER_MANAGE],
  nodeArchive: [MATTER_MANAGE],
  nodeRestore: [MATTER_MANAGE],
  nodeForceRemove: [MATTER_MANAGE],
  endpointUpdate: [MATTER_MANAGE],
  reconciliationRun: [MATTER_MANAGE],

  // Future: commissioning (ATT-1002).
  commissioningStart: [MATTER_COMMISSION],
  commissioningStatus: [MATTER_COMMISSION],
  /** Opens a commissioning window so another controller can join. */
  commissioningShare: [MATTER_COMMISSION],
  commissioningRemoveFromFabric: [MATTER_COMMISSION],
  attestationOverride: [MATTER_COMMISSION, MATTER_MANAGE],

  // Future: direct commands (ATT-1011). See REQUIRES_CONFIRMATION.
  directCommand: [MATTER_COMMAND_DIRECT],

  // Future: OTA (ATT-1015).
  otaStatus: [MATTER_READ],
  otaApprove: [MATTER_MANAGE],
  otaApply: [MATTER_MANAGE],

  // Future: Thread and border routers (ATT-1012).
  /** Status and non-secret dataset metadata. */
  threadStatus: [THREAD_READ],
  threadDatasetSet: [THREAD_MANAGE],
  threadOtbrManage: [THREAD_MANAGE],
  /** Returns the network key. Session only: use `@SessionAuth`, see SESSION_ONLY_OPERATIONS. */
  threadDatasetExport: [THREAD_MANAGE],

  // Future: development overrides.
  developmentOverrides: [MATTER_MANAGE],

  // Future: live topics (authorize on subscribe and on every lease renewal).
  liveDeviceInventory: [MATTER_READ],
  liveDeviceState: [MATTER_READ],
  liveThread: [THREAD_READ],
} as const satisfies Record<string, readonly PermissionKey[]>;

export type MatterOperation = keyof typeof MATTER_OPERATIONS;

/** Operations a scoped API token must never perform; guard them with `@SessionAuth` (D9). */
export const SESSION_ONLY_OPERATIONS: readonly MatterOperation[] = ['threadDatasetExport'];

/**
 * Direct commands that need an explicit confirmation in the UI and API before they are sent (enforced by ATT-1011):
 * unlocking or unbolting a door lock and switching power on.
 */
export const REQUIRES_CONFIRMATION = ['unlock', 'unbolt', 'power-on'] as const;

export type ConfirmedDirectCommand = (typeof REQUIRES_CONFIRMATION)[number];
