import { Message } from '@attraccess/database-entities';

export class MessageCreatedEvent {
  static readonly EVENT_NAME = 'message.created';

  constructor(public readonly message: Message) {}
}
