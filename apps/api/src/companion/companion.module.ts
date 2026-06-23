import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionGateway } from './companion.gateway';
import { CompanionController } from './companion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompanionDevice, ResourceFlowNode])],
  providers: [CompanionService, CompanionGatewayService, CompanionAuthHandler, CompanionGateway],
  controllers: [CompanionController],
  exports: [CompanionService, CompanionGateway, CompanionGatewayService],
})
export class CompanionModule {}
