import { PushSubscription } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushPersistence, SubscriptionRegistration } from './port';

@Injectable()
export class TypeormPushPersistence extends PushPersistence {
  constructor(@InjectRepository(PushSubscription) private readonly subscriptions: Repository<PushSubscription>) {
    super();
  }

  countSubscriptions(): Promise<number> {
    return this.subscriptions.count();
  }
  async removeAllSubscriptions(): Promise<number> {
    const count = await this.subscriptions.count();
    await this.subscriptions.createQueryBuilder().delete().execute();
    return count;
  }
  async registerSubscription(input: SubscriptionRegistration): Promise<PushSubscription> {
    const existing = await this.subscriptions.findOne({ where: { endpoint: input.endpoint } });
    const row = existing ?? this.subscriptions.create({ endpoint: input.endpoint });
    row.userId = input.userId;
    row.p256dh = input.p256dh;
    row.auth = input.auth;
    row.userAgent = input.userAgent ?? row.userAgent ?? null;
    row.lastSeenAt = input.lastSeenAt;
    return { ...(await this.subscriptions.save(row)) };
  }
  async removeOwnedSubscription(userId: number, endpoint: string): Promise<void> {
    await this.subscriptions.delete({ userId, endpoint });
  }
  async listUserSubscriptions(userId: number): Promise<PushSubscription[]> {
    return (await this.subscriptions.find({ where: { userId } })).map((row) => ({ ...row }));
  }
  async removeStaleSubscription(id: number): Promise<void> {
    await this.subscriptions.delete({ id });
  }
}
