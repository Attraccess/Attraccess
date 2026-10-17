import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';
import { LiveSubscription } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer, map } from 'rxjs';
import { BillingTransaction } from '../../transport/models/billing-transaction.dto';
import { mapResponse } from '../../transport/response-mapper';
import { finalize } from 'rxjs/operators';
import { LiveTopicProvider } from '../../live-updates/live-topic-provider';
import { LiveTopicsService } from '../../live-updates/live-topics.service';
import { LiveNotificationsService } from './live-notifications.service';

@Injectable()
export class BillingLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [{ topic: 'billing', scope: 'user' }] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly billing: LiveNotificationsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  source(_subscription: LiveSubscription, user: AuthenticatedUser) {
    return defer(() => this.billing.getTransactionSubject(user.id).asObservable()).pipe(
      map((event) => ({ data: mapResponse(BillingTransaction, event.data) })),
      finalize(() => this.billing.deleteSubjectIfUnobserved(user.id)),
    );
  }
}
