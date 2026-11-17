import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { COMPANION_DEVICE_STORE } from '../../../companion/companion-device.port';
import { TypeOrmCompanionDeviceStore } from './typeorm-companion-device.store';

@Module({
  imports: [TypeOrmModule.forFeature([CompanionDevice, ResourceFlowNode])],
  providers: [{ provide: COMPANION_DEVICE_STORE, useClass: TypeOrmCompanionDeviceStore }],
  exports: [COMPANION_DEVICE_STORE],
})
export class CompanionPersistenceModule {}
