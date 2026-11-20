import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardPin, Resource, User } from '@attraccess/database-entities';
import { DASHBOARD_PIN_STORE } from '../../../dashboard/dashboard-pin-store.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmDashboardPinStore } from './typeorm-dashboard-pin.store';

@Module({
  imports: [UnitOfWorkModule, TypeOrmModule.forFeature([DashboardPin, Resource, User])],
  providers: [{ provide: DASHBOARD_PIN_STORE, useClass: TypeOrmDashboardPinStore }],
  exports: [DASHBOARD_PIN_STORE, UnitOfWorkModule],
})
export class DashboardPersistenceModule {}
