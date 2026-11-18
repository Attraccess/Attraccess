import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from '@attraccess/database-entities';
import { PUSH_SUBSCRIPTION_STORE } from '../../../push/push-subscription-store.port';
import { TypeOrmPushSubscriptionStore } from './typeorm-push-subscription-store';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  providers: [{ provide: PUSH_SUBSCRIPTION_STORE, useClass: TypeOrmPushSubscriptionStore }],
  exports: [PUSH_SUBSCRIPTION_STORE],
})
export class PushPersistenceModule {}
