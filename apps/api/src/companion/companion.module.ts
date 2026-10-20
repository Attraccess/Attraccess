import { DeviceEnrollmentModule } from '../device-enrollment/device-enrollment.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionGateway } from './companion.gateway';
import { CompanionController, CompanionDownloadController } from './companion.controller';

@Module({
  imports: [DeviceEnrollmentModule, TypeOrmModule.forFeature([CompanionDevice, ResourceFlowNode])],
  providers: [CompanionService, CompanionGatewayService, CompanionAuthHandler, CompanionGateway],
  controllers: [CompanionController, CompanionDownloadController],
  exports: [CompanionService, CompanionGateway, CompanionGatewayService],
})
export class CompanionModule {}
