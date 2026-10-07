import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
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
import { ResourceFlowsExecutorServicePressButtonOperation } from './resource-flows-executor.service.resource-flows-executor-service-press-button-operation';

@Injectable()
export class ResourceFlowsExecutorService
  extends ResourceFlowsExecutorServicePressButtonOperation
  implements OnModuleInit
{
  constructor(
    @InjectRepository(ResourceFlowNode)
    flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    resourceRepository: Repository<Resource>,
    flowLogs: FlowLogRecorderService,
    mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    resourceUsageService: ResourceUsageService,
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
    super(
      flowNodeRepository,
      flowEdgeRepository,
      resourceRepository,
      flowLogs,
      mqttClientService,
      resourceUsageService,
      billingTransactionItemRepository,
      eventEmitter,
      resourceHealthService,
      variablesService,
      cronTimer,
      flowTimer,
      companionGatewayService,
      operatingIntervals,
      metering,
    );
  }
}
