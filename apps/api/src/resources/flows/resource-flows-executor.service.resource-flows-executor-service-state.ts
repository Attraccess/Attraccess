import { forwardRef, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowNode, ResourceFlowEdge, Resource, BillingTransactionItem } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { ResourceMeteringService } from '../metering/resource-metering.service';
import { FlowExecutionContext } from './flow-execution-context';
import { FlowExecutionEngine } from './flow-execution-engine';
import { FlowTriggerDispatcher } from './flow-trigger-dispatcher';
import { FlowResourceMonitor } from './flow-resource-monitor';
import { buildNodeExecutorRegistry } from './node-executor-registry';
import { ResourceFlowsExecutorServiceOnModuleInitContract } from './resource-flows-executor.service.resource-flows-executor-service-on-module-init-contract';
export abstract class ResourceFlowsExecutorServiceState extends ResourceFlowsExecutorServiceOnModuleInitContract {
  protected readonly logger = new Logger('ResourceFlowsExecutorService');

  protected readonly resourceActivity = new Map<Resource['id'], Date>();

  protected readonly heartbeatLastSeen = new Map<string, Date>();

  protected readonly engine: FlowExecutionEngine;

  protected readonly triggers: FlowTriggerDispatcher;

  protected readonly monitor: FlowResourceMonitor;

  constructor(
    @InjectRepository(ResourceFlowNode)
    protected readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    resourceRepository: Repository<Resource>,
    flowLogs: FlowLogRecorderService,
    mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    protected readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    billingTransactionItemRepository: Repository<BillingTransactionItem>,
    eventEmitter: EventEmitter2,
    resourceHealthService: ResourceHealthService,
    variablesService: ResourceFlowVariablesService,
    cronTimer: CronTimer,
    flowTimer: FlowTimer,
    companionGatewayService: CompanionGatewayService,
    operatingIntervals: ResourceOperatingIntervalService,
    @Inject(forwardRef(() => ResourceMeteringService)) metering: ResourceMeteringService,
  ) {
    super();
    const nodeExecutors = buildNodeExecutorRegistry({
      resourceActivity: this.resourceActivity,
      heartbeatLastSeen: this.heartbeatLastSeen,
      resourceHealthService,
      resourceUsageService,
      billingTransactionItemRepository,
      mqttClientService,
      operatingIntervals,
      eventEmitter,
      variablesService,
      companionGatewayService,
      metering,
    });
    this.engine = new FlowExecutionEngine(
      flowNodeRepository,
      flowEdgeRepository,
      flowLogs,
      flowTimer,
      nodeExecutors,
      new FlowExecutionContext(resourceRepository, variablesService),
      this.logger,
    );
    this.triggers = new FlowTriggerDispatcher(
      flowNodeRepository,
      mqttClientService,
      (nodes, data) => this.startFlow(nodes, data),
      this.logger,
    );
    this.monitor = new FlowResourceMonitor(
      flowNodeRepository,
      this.resourceActivity,
      this.heartbeatLastSeen,
      resourceHealthService,
      cronTimer,
      (node, data) => this.startFlow(node, data),
      this.logger,
    );
  }
}
