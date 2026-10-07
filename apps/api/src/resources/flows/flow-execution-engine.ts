import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowEdge, ResourceFlowNodeType } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { NodeExecutor } from './node-executors';
import { FlowExecutionContext } from './flow-execution-context';
import { FlowExecutionEngineExecuteNextNodesOperation } from './flow-execution-engine.flow-execution-engine-execute-next-nodes-operation';

export class FlowExecutionEngine extends FlowExecutionEngineExecuteNextNodesOperation {
  constructor(
    flowNodeRepository: Repository<ResourceFlowNode>,
    flowEdgeRepository: Repository<ResourceFlowEdge>,
    flowLogs: FlowLogRecorderService,
    flowTimer: FlowTimer,
    nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>,
    context: FlowExecutionContext,
    logger: Logger,
  ) {
    super(flowNodeRepository, flowEdgeRepository, flowLogs, flowTimer, nodeExecutors, context, logger);
  }
}

export { settleFlowBranches } from './settle-flow-branches';
