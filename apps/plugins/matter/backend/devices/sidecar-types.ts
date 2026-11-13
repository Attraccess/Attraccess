import type { OperationResponse } from '@attraccess/matter-contract';

export type NodeListView = OperationResponse<'inventory.list'>;
export type NodeView = OperationResponse<'inventory.get'>;
