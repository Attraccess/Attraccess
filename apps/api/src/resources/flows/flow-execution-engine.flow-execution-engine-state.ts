import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowEdge, ResourceFlowNodeType } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { NodeExecutor } from './node-executors';
import { FlowExecutionContext } from './flow-execution-context';
import { FlowExecutionEngineStartFlowContract } from './flow-execution-engine.flow-execution-engine-start-flow-contract';
export abstract class FlowExecutionEngineState extends FlowExecutionEngineStartFlowContract {
  constructor(
    protected readonly flowNodeRepository: Repository<ResourceFlowNode>,
    protected readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    protected readonly flowLogs: FlowLogRecorderService,
    protected readonly flowTimer: FlowTimer,
    protected readonly nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>,
    protected readonly context: FlowExecutionContext,
    protected readonly logger: Logger,
  ) {
    super();
  }
}
