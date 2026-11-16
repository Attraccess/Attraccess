import { Attractap } from '@attraccess/database-entities';

export class ReaderUpdatedEvent {
  public static readonly EVENT_NAME = 'reader.updated';
  constructor(public readonly reader: Attractap) {}
}

export class ReaderDeletedEvent {
  public static readonly EVENT_NAME = 'reader.deleted';
  constructor(public readonly readerId: number) {}
}

/** A connected reader's time zone or offset changed; the session start times of its resource list follow it. */
export class ReaderTimeZoneChangedEvent {
  public static readonly EVENT_NAME = 'reader.time-zone-changed';
  constructor(public readonly readerId: number) {}
}
