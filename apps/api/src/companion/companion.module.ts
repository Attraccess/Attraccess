import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanionDevice } from '@attraccess/database-entities';
import { CompanionService } from './companion.service';
import { CompanionGateway } from './companion.gateway';
import { CompanionController } from './companion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompanionDevice])],
  providers: [CompanionService, CompanionGateway],
  controllers: [CompanionController],
  exports: [CompanionService, CompanionGateway],
})
export class CompanionModule {}
