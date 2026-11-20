import type { Metadata } from './api';

/** What every endpoint card in a node's tree shares. */
export interface EndpointCardOptions {
  /** The node's name: a bridged endpoint sits behind it. */
  bridgeName: string;
  /** Endpoint names are editable (manage, claimed device). */
  canEdit: boolean;
  /** State may be read (`matter.devices.read`). */
  canRead: boolean;
  /** The flow usage of each endpoint is shown; not for a device that is not usable yet. */
  showFlowUsage: boolean;
  onRename: (endpointRef: string, changes: Partial<Metadata>) => Promise<unknown>;
}
