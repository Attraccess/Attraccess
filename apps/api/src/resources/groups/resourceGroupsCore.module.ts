import { Module } from '@nestjs/common';
import { GroupsPersistenceModule } from '../../database/adapters/resources/groups-persistence.module';
import { FormsPersistenceModule } from '../../database/adapters/resources/forms-persistence.module';
import { ResourceGroupsService } from './resourceGroups.service';

/**
 * The group service on its own. Retraining needs it, and the group introductions in `ResourceGroupsModule` need
 * retraining, so both import this module instead of each other.
 */
@Module({
  imports: [GroupsPersistenceModule, FormsPersistenceModule],
  providers: [ResourceGroupsService],
  exports: [ResourceGroupsService],
})
export class ResourceGroupsCoreModule {}
