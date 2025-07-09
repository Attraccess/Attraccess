import { Attractap } from '@attraccess/database-entities';

export class ReaderUpdatedEvent {
  constructor(public readonly reader: Attractap) {}
}
