// Matter plugin — backend half.
//
// ATT-996 adds the device model: nodes, endpoints, state and their lifecycle (backend/devices).
// ATT-1001: an authenticated, version-checked connection to the Matter sidecar, configured by an administrator
// in the web UI. The sidecar being absent, restarting or incompatible never stops this plugin from loading; it
// shows an explicit degraded state instead. ATT-998 adds fabric persistence and encrypted backup/restore.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import type { DynamicModule } from '@nestjs/common';
import { MatterBackupController } from './backup/controller';
import { BACKUP_ENTITIES } from './backup/entities';
import { MatterBackupService } from './backup/backup.service';
import { MatterRestoreService } from './backup/restore.service';
import { MatterBackupSchedulerService } from './backup/scheduler.service';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterConnectionService } from './connection/connection.service';
import { MatterConnection } from './connection/entity';
import { MatterSettingsService } from './connection/settings.service';
import { DeviceAuditService } from './devices/audit.service';
import { MatterDevicesController } from './devices/controller';
import { DEVICE_ENTITIES } from './devices/entities';
import { MatterIngestionService } from './devices/ingestion.service';
import { MatterLifecycleService } from './devices/lifecycle.service';
import { MatterReconciliationService } from './devices/reconciliation.service';
import { MatterStateService } from './devices/state.service';
import { MatterFabricController } from './fabric/controller';
import { MatterFabricService } from './fabric/fabric.service';
import { MatterFabricGuard } from './fabric/guard';
import { hostMigrationReader } from './fabric/migration-reader';
import { RecoveryKeyService } from './fabric/recovery-key.service';
import { PLUGIN_MIGRATION_READER } from './fabric/tokens';
import { PLUGIN_CONTEXT } from './plugin-context';

class MatterPluginModule {}

const plugin: PluginBackendModule = {
  // Registered into the shared DataSource so `context.getRepository(MatterConnection)` resolves.
  entities: [MatterConnection, ...DEVICE_ENTITIES, ...BACKUP_ENTITIES],
  auditDomains: [MATTER_AUDIT_DOMAIN],
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
        MatterStateService,
        MatterReconciliationService,
        MatterLifecycleService,
        MatterIngestionService,
        // ATT-998: fabric persistence, encrypted backups and restore.
        { provide: PLUGIN_MIGRATION_READER, useValue: hostMigrationReader(context) },
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
