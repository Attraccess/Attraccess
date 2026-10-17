import { ApiProperty } from '@nestjs/swagger';
import { DocumentationType } from '@attraccess/application-models';

import { Attractap } from './attractap.dto';

import { Form } from './form.dto';

import { ResourceBillingConfiguration } from './resource-billing-configuration.dto';

import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.dto';

import { ResourceOperatingInterval } from './resource-operating-interval.dto';

import { ResourceMaintenance } from './resource.maintenance.dto';

import { ResourceType } from '@attraccess/application-models';

import { ResourceFlowEdge } from './resourceFlowEdge.dto';

import { ResourceFlowNode } from './resourceFlowNode.dto';

import { ResourceFlowVariable } from './resourceFlowVariable.dto';

import { ResourceGroup } from './resourceGroup.dto';

import { ResourceIntroducer } from './resourceIntroducer.dto';

import { ResourceIntroduction } from './resourceIntroduction.dto';

import { ResourceUsage } from './resourceUsage.dto';

import { AutoIntroductionTarget, SupervisionMode } from './resource.supervision.dto';
import type { ResponseFields } from '../response-mapper';

export class Resource {
  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    example: false,
    default: false,
  })
  allowTakeOver!: boolean;

  @ApiProperty({
    description:
      'Days after a user was trained on this resource before retraining is required. Null disables the age-based trigger.',
    example: 365,
    required: false,
    nullable: true,
  })
  retrainingMaxAgeDays!: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using this resource before retraining is required. Null disables the inactivity trigger.',
    example: 180,
    required: false,
    nullable: true,
  })
  retrainingMaxInactivityDays!: number | null;

  @ApiProperty({
    description: 'Whether to block resource access once retraining is due until the user is retrained',
    example: false,
    default: false,
  })
  retrainingBlocksAccess!: boolean;

  @ApiProperty({
    description: 'Controls who may start a usage session on this resource',
    enum: SupervisionMode,
    enumName: 'SupervisionMode',
    example: SupervisionMode.INTRODUCTION_REQUIRED,
    default: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  supervisionMode!: SupervisionMode;

  @ApiProperty({
    description:
      'Automatically create an introduction after this many supervised sessions. Null disables auto-promotion.',
    example: 3,
    required: false,
    nullable: true,
  })
  supervisedUsagesUntilIntroduction!: number | null;

  @ApiProperty({
    description: 'Target of the auto-created introduction once the supervised-usage threshold is reached',
    enum: AutoIntroductionTarget,
    enumName: 'AutoIntroductionTarget',
    example: AutoIntroductionTarget.RESOURCE,
    required: false,
    nullable: true,
  })
  autoIntroductionTarget!: AutoIntroductionTarget | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    example: 1,
    required: false,
    nullable: true,
  })
  autoIntroductionGroupId!: number | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    type: () => ResourceGroup,
    required: false,
    nullable: true,
  })
  autoIntroductionGroup!: ResourceGroup | null;

  @ApiProperty({
    description: 'The unique identifier of the resource',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
  })
  name!: string;

  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
    enumName: 'ResourceType',
  })
  type!: ResourceType;

  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
  })
  separateUnlockAndUnlatch!: boolean | null;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description: 'The filename of the resource image',
    example: '1234567890_abcdef.jpg',
    required: false,
  })
  imageFilename!: string | null;

  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
    enumName: 'DocumentationType',
  })
  documentationType!: DocumentationType | null;

  @ApiProperty({
    description: 'Markdown content for resource documentation',
    required: false,
    example: '# Resource Documentation\n\nThis is a markdown documentation for the resource.',
  })
  documentationMarkdown!: string | null;

  @ApiProperty({
    description: 'URL to external documentation',
    required: false,
    example: 'https://example.com/documentation',
  })
  documentationUrl!: string | null;

  @ApiProperty({
    description: 'Custom metadata key-value pairs configured for this resource',
    required: false,
    type: Object,
    example: {
      location: 'lab-1',
      template: 'door-access',
    },
    additionalProperties: true,
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({
    description: 'When the resource was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the resource was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'When the resource was deleted',
    nullable: true,
  })
  deletedAt!: Date | null;

  introductions!: ResourceIntroduction[];

  usages!: ResourceUsage[];

  operatingIntervals!: ResourceOperatingInterval[];

  flowNodes!: ResourceFlowNode[];

  flowEdges!: ResourceFlowEdge[];

  flowVariables!: ResourceFlowVariable[];

  introducers!: ResourceIntroducer[];

  @ApiProperty({
    description: 'The groups the resource belongs to',
    type: ResourceGroup,
    isArray: true,
  })
  groups!: ResourceGroup[];

  attractapReaders!: Attractap[];

  maintenances!: ResourceMaintenance[];

  maintenanceSchedules!: ResourceMaintenanceSchedule[];

  billingConfigurations!: ResourceBillingConfiguration[];

  @ApiProperty({ description: 'The forms attached to the resource', type: () => Form, isArray: true })
  forms!: Form[];
  static readonly responseFields: ResponseFields = {
    allowTakeOver: null,
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: null,
    supervisionMode: null,
    supervisedUsagesUntilIntroduction: null,
    autoIntroductionTarget: null,
    autoIntroductionGroupId: null,
    autoIntroductionGroup: () => ResourceGroup,
    id: null,
    name: null,
    type: null,
    separateUnlockAndUnlatch: null,
    description: null,
    imageFilename: null,
    documentationType: null,
    documentationMarkdown: null,
    documentationUrl: null,
    metadata: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    introductions: () => ResourceIntroduction,
    usages: () => ResourceUsage,
    operatingIntervals: () => ResourceOperatingInterval,
    flowNodes: () => ResourceFlowNode,
    flowEdges: () => ResourceFlowEdge,
    flowVariables: () => ResourceFlowVariable,
    introducers: () => ResourceIntroducer,
    groups: () => ResourceGroup,
    attractapReaders: () => Attractap,
    maintenances: () => ResourceMaintenance,
    maintenanceSchedules: () => ResourceMaintenanceSchedule,
    billingConfigurations: () => ResourceBillingConfiguration,
    forms: () => Form,
  };
}
