import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { ResourceGroupsService } from './resourceGroups.service';

/**
 * The group service on its own. Retraining needs it, and the group introductions in `ResourceGroupsModule` need
 * retraining, so both import this module instead of each other.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Resource, ResourceGroup, ResourceIntroduction, ResourceIntroducer])],
  providers: [ResourceGroupsService],
  exports: [ResourceGroupsService],
})
export class ResourceGroupsCoreModule {}
