import type { AttractapLinkedResource } from '@attraccess/application-models';

/** The resource facts the reader protocol needs that are not part of a reader's own record. */
export interface AttractapResourceReads {
  findResource(id: number): Promise<AttractapLinkedResource | null>;
  /** The given resources that have at least one active usage session. */
  findResourceIdsWithActiveUsage(resourceIds: number[]): Promise<Set<number>>;
}

export const ATTRACTAP_RESOURCE_READS = Symbol.for('attraccess.attractap.resource-reads');
