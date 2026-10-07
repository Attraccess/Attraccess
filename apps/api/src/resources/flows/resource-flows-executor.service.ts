import {
  BillingTransactionItem,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { forwardRef, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { FlowCompanionInputImplementation } from './flow-companion-input';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { NodeExecutor, TemplateVariables } from './node-executors';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

@Injectable()
export class ResourceFlowsExecutorService extends FlowCompanionInputImplementation implements OnModuleInit {
  protected readonly logger = new Logger(ResourceFlowsExecutorService.name);

  protected readonly resourceActivity: Map<Resource['id'], Date> = new Map();
  protected readonly heartbeatLastSeen: Map<string, Date> = new Map();
  /** Preserve event lookup order without serializing the flow runs they launch. */
  protected pluginFlowLookupQueue: Promise<void> = Promise.resolve();

  protected readonly templateVariables = new WeakMap<object, TemplateVariables>();

  /**
   * Registry mapping every flow node type to its executor strategy. Declaring it
   * as a `Record` keyed by the enum keeps node-type coverage exhaustive at
   * compile time (a missing type is a type error).
   */
  protected readonly nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>;

  constructor(
    @InjectRepository(ResourceFlowNode)
    protected readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    protected readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    protected readonly flowLogs: FlowLogRecorderService,
    protected readonly mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    protected readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    protected readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly resourceHealthService: ResourceHealthService,
    protected readonly variablesService: ResourceFlowVariablesService,
    protected readonly cronTimer: CronTimer,
    protected readonly flowTimer: FlowTimer,
    protected readonly companionGatewayService: CompanionGatewayService,
    protected readonly operatingIntervals: ResourceOperatingIntervalService,
  ) {
    super();
    this.nodeExecutors = this.buildNodeExecutorRegistry();
  }
}
