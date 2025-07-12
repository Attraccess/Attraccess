import { Attractap } from '@attraccess/database-entities';

export class ReaderUpdatedEvent {
  public static readonly EVENT_NAME = 'reader.updated';
  constructor(public readonly reader: Attractap) {}
}
