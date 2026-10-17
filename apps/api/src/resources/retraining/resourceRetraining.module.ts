import { ResourceRetrainingPersistence } from './persistence/port';
import { TypeormResourceRetrainingPersistence } from './persistence/typeorm-adapter';
import { forwardRef, Module } from '@nestjs/common';
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
    forwardRef(() => ResourceGroupsModule),
    EmailModule,
  ],
  controllers: [ResourceRetrainingController],
  providers: [
    ResourceRetrainingService,
    { provide: ResourceRetrainingPersistence, useClass: TypeormResourceRetrainingPersistence },
  ],
  exports: [ResourceRetrainingService],
})
export class ResourceRetrainingModule {}
