// Matter plugin — backend half.
//
// ATT-996 adds the device model: nodes, endpoints, state and their lifecycle (backend/devices).
// ATT-1001: an authenticated, version-checked connection to the Matter sidecar, configured by an administrator
// in the web UI. The sidecar being absent, restarting or incompatible never stops this plugin from loading; it
// shows an explicit degraded state instead. ATT-998 adds fabric persistence and encrypted backup/restore.
// ATT-1003 declares the plugin's own permission keys (./permissions).
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import type { DynamicModule } from '@nestjs/common';
import { MatterBackupController } from './backup/controller';
import { MatterBackupService } from './backup/backup.service';
import { MatterRestoreService } from './backup/restore.service';
import { MatterBackupSchedulerService } from './backup/scheduler.service';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterConnectionService } from './connection/connection.service';
import { MatterSettingsService } from './connection/settings.service';
import { DeviceAuditService } from './devices/audit.service';
import { MatterChangeBus } from './devices/change-bus';
import { MatterDevicesController } from './devices/controller';
import { MatterIngestionService } from './devices/ingestion.service';
import { MatterLifecycleService } from './devices/lifecycle.service';
import { MatterLiveUpdatesService } from './devices/live-updates.service';
import { MatterReconciliationService } from './devices/reconciliation.service';
import { MatterStateService } from './devices/state.service';
import { MatterFabricController } from './fabric/controller';
import { MatterFabricService } from './fabric/fabric.service';
import { MatterFabricGuard } from './fabric/guard';
import { storageSchemaReader } from './fabric/migration-reader';
import { RecoveryKeyService } from './fabric/recovery-key.service';
import { PLUGIN_MIGRATION_READER } from './fabric/tokens';
import { MATTER_PERMISSIONS } from './permissions';
import { PLUGIN_CONTEXT } from './plugin-context';
import { MATTER_STORAGE } from './plugin-storage/tables';

class MatterPluginModule {}

const plugin: PluginBackendModule = {
  // The plugin's own tables: declared in ./plugin-storage/tables, created, adopted and migrated by the host.
  storage: MATTER_STORAGE,
  auditDomains: [MATTER_AUDIT_DOMAIN],
  // ATT-1003: least-privilege Matter and Thread keys; every route requires one (see ./permissions).
  permissions: MATTER_PERMISSIONS,
  register(context: PluginContext): DynamicModule {
    return {
      module: MatterPluginModule,
      controllers: [
        MatterConnectionController,
        MatterDevicesController,
        MatterFabricController,
        MatterBackupController,
      ],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        MatterSettingsService,
        MatterConnectionService,
        DeviceAuditService,
        MatterChangeBus,
        MatterStateService,
        MatterReconciliationService,
        MatterLifecycleService,
        MatterIngestionService,
        MatterLiveUpdatesService,
        // ATT-998: fabric persistence, encrypted backups and restore.
        { provide: PLUGIN_MIGRATION_READER, useValue: storageSchemaReader() },
        MatterFabricGuard,
        RecoveryKeyService,
        MatterBackupService,
        MatterFabricService,
        MatterRestoreService,
        MatterBackupSchedulerService,
      ],
    };
  },
};

export default plugin;
