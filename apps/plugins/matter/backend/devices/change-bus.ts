import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

/** Something the device views would now answer differently. Carries no data: readers refetch through REST. */
export type MatterChange = { kind: 'inventory' } | { kind: 'state'; endpointRef: string };

/**
 * In-process notifications from the services that change nodes, endpoints or state to the live-update topics. A
 * service calls it after its transaction committed; nothing here reads or stores data, so a notification can never
 * carry more than "this changed".
 */
@Injectable()
export class MatterChangeBus {
  private readonly subject = new Subject<MatterChange>();

  readonly changes: Observable<MatterChange> = this.subject.asObservable();

  /** A node or endpoint was created, updated, changed lifecycle state or reachability. */
  inventoryChanged(): void {
    this.subject.next({ kind: 'inventory' });
  }

  /** State entries of these endpoints (by endpoint UUID) changed. */
  stateChanged(endpointRefs: Iterable<string>): void {
    for (const endpointRef of new Set(endpointRefs)) this.subject.next({ kind: 'state', endpointRef });
  }
}
