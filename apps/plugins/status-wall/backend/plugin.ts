// Status Wall plugin — backend half.
//
// Managers configure any number of walls (a name and a resource selection). Each wall has a secret public link that a
// big screen opens without signing in: it shows every selected resource as a picture with a traffic-light state
// (maintenance, in use, ready) and updates live through server-sent events.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { PLUGIN_CONTEXT, STATUS_WALL_CLOCK } from './constants';
import { STATUS_WALL_PERMISSIONS } from './permissions';
import { PublicWallController } from './public.controller';
import { statusWallStorage } from './storage';
import { WallSnapshotService } from './wall-snapshot.service';
import { WallStatusService } from './wall-status.service';
import { WallsController } from './walls.controller';
import { WallsService } from './walls.service';

class StatusWallPluginModule {}

const plugin: PluginBackendModule = {
  storage: statusWallStorage,
  permissions: STATUS_WALL_PERMISSIONS,
  register(context: PluginContext): DynamicModule {
    return {
      module: StatusWallPluginModule,
      controllers: [WallsController, PublicWallController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        { provide: STATUS_WALL_CLOCK, useValue: () => new Date() },
        WallsService,
        WallStatusService,
        WallSnapshotService,
      ],
    };
  },
};

export default plugin;
