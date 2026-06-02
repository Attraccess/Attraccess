import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceGroupsModule } from '../groups/resourceGroups.module';
import { EmailModule } from '../../email/email.module';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { ResourceRetrainingController } from './resourceRetraining.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceUsage,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
    ]),
    ResourceGroupsModule,
    EmailModule,
  ],
  controllers: [ResourceRetrainingController],
  providers: [ResourceRetrainingService],
  exports: [ResourceRetrainingService],
})
export class ResourceRetrainingModule {}
