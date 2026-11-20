import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreference } from '@attraccess/database-entities';
import { NOTIFICATION_PREFERENCE_STORE } from '../../../notifications/notification-preference-store.port';
import { TypeOrmNotificationPreferenceStore } from './typeorm-notification-preference-store';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference])],
  providers: [{ provide: NOTIFICATION_PREFERENCE_STORE, useClass: TypeOrmNotificationPreferenceStore }],
  exports: [NOTIFICATION_PREFERENCE_STORE],
})
export class NotificationsPersistenceModule {}
