import { ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { T } from './external-flow-schemas.test-fixture';
export async function seedFlowMeter(
  source: DataSource,
  startData: object = {},
  collectData: object = { finalRetryDelaySeconds: 0 },
) {
  const nodes = source.getRepository(ResourceFlowNode);
  await nodes.save([
    { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
    { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
    { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
    {
      id: 'report',
      type: T.OUTPUT_METERING_REPORT,
      resourceId: 1,
      data: { meterId: 1, value: '1' },
    },
  ]);
  await source.getRepository(ResourceFlowEdge).save([
    { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
    { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
  ]);
}
