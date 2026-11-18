import type { MessageRecord } from '@attraccess/application-models';

export class MessageCreatedEvent {
  static readonly EVENT_NAME = 'message.created';

  constructor(public readonly message: MessageRecord) {}
}
