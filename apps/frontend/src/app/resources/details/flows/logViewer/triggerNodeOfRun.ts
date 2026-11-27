import { ResourceFlowNodeDto } from '@attraccess/react-query-client';

// Logs are newest-first and a run's oldest entry is the synthetic flow.start, which has
// no node — so the node that triggered the run is the oldest entry that does have one.
export function triggerNodeOfRun<T extends { node?: ResourceFlowNodeDto }>(logsNewestFirst: T[]) {
  return [...logsNewestFirst].reverse().find((log) => log.node)?.node;
}
