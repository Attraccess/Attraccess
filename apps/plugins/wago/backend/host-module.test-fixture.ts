import { PLUGIN_RESOURCE_VISIBILITY_HOST } from '@attraccess/plugins-backend-sdk';
import { Global, Module } from '@nestjs/common';

/** What the host's global plugin module provides to every plugin module (the routes' `@ResourceVisible()`). */
@Global()
@Module({
  providers: [{ provide: PLUGIN_RESOURCE_VISIBILITY_HOST, useValue: { canSee: async () => true } }],
  exports: [PLUGIN_RESOURCE_VISIBILITY_HOST],
})
export class HostModule {}
