import { Attractap } from '@attraccess/database-entities';

export class ReaderUpdatedEvent {
  public static readonly EVENT_NAME = 'reader.updated';
  constructor(public readonly reader: Attractap) {}
}

export class ReaderDeletedEvent {
  public static readonly EVENT_NAME = 'reader.deleted';
  constructor(public readonly readerId: number) {}
}
