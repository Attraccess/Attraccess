import { Module } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { ResourcesPersistenceModule } from '../../database/adapters/resources/resources-persistence.module';
import { ResourceListVisibilityService } from './resource-list-visibility.service';
import { ResourceListVisibleInterceptor } from './resource-list-visible.interceptor';

@Module({
  imports: [SettingsModule, ResourcesPersistenceModule],
  providers: [ResourceListVisibilityService, ResourceListVisibleInterceptor],
  exports: [ResourceListVisibilityService, ResourceListVisibleInterceptor],
})
export class ResourceListVisibilityModule {}
