import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PushSubscription } from '@attraccess/database-entities';
import { PushSubscriptionInput, PushSubscriptionRecord } from '@attraccess/application-models';
import { Repository } from 'typeorm';
import { PushSubscriptionStore } from '../../../push/push-subscription-store.port';

const toRecord = (row: PushSubscription): PushSubscriptionRecord => ({
  id: row.id,
  userId: row.userId,
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
  userAgent: row.userAgent,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
});

@Injectable()
export class TypeOrmPushSubscriptionStore implements PushSubscriptionStore {
  constructor(@InjectRepository(PushSubscription) private readonly subscriptions: Repository<PushSubscription>) {}

  count(): Promise<number> {
    return this.subscriptions.count();
  }

  async deleteAll(): Promise<void> {
    await this.subscriptions.createQueryBuilder().delete().execute();
  }

  async upsertByEndpoint(input: PushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const existing = await this.subscriptions.findOne({ where: { endpoint: input.endpoint } });
    const subscription = existing ?? this.subscriptions.create({ endpoint: input.endpoint });

    subscription.userId = input.userId;
    subscription.p256dh = input.p256dh;
    subscription.auth = input.auth;
    subscription.userAgent = input.userAgent ?? subscription.userAgent ?? null;
    subscription.lastSeenAt = new Date();

    return toRecord(await this.subscriptions.save(subscription));
  }

  async findForUser(userId: number): Promise<PushSubscriptionRecord[]> {
    return (await this.subscriptions.find({ where: { userId } })).map(toRecord);
  }

  async deleteForUser(userId: number, endpoint: string): Promise<void> {
    await this.subscriptions.delete({ userId, endpoint });
  }

  async deleteById(id: number): Promise<void> {
    await this.subscriptions.delete({ id });
  }
}
