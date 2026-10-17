import { DocumentationType } from '../types/documentationType.enum';

import { Attractap } from './attractap';

import { Form } from './form';

import { ResourceBillingConfiguration } from './resource-billing-configuration';

import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule';

import { ResourceOperatingInterval } from './resource-operating-interval';

import { ResourceMaintenance } from './resource.maintenance';

import { ResourceType } from './resource.type';

import { ResourceFlowEdge } from './resourceFlowEdge';

import { ResourceFlowNode } from './resourceFlowNode';

import { ResourceFlowVariable } from './resourceFlowVariable';

import { ResourceGroup } from './resourceGroup';

import { ResourceIntroducer } from './resourceIntroducer';

import { ResourceIntroduction } from './resourceIntroduction';

import { ResourceUsage } from './resourceUsage';

import { AutoIntroductionTarget, SupervisionMode } from './resource.supervision';

export interface Resource {
  allowTakeOver: boolean;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  supervisionMode: SupervisionMode;
  supervisedUsagesUntilIntroduction: number | null;
  autoIntroductionTarget: AutoIntroductionTarget | null;
  autoIntroductionGroupId: number | null;
  autoIntroductionGroup: ResourceGroup | null;
  id: number;
  name: string;
  type: ResourceType;
  separateUnlockAndUnlatch: boolean | null;
  description: string | null;
  imageFilename: string | null;
  documentationType: DocumentationType | null;
  documentationMarkdown: string | null;
  documentationUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  introductions: ResourceIntroduction[];
  usages: ResourceUsage[];
  operatingIntervals: ResourceOperatingInterval[];
  flowNodes: ResourceFlowNode[];
  flowEdges: ResourceFlowEdge[];
  flowVariables: ResourceFlowVariable[];
  introducers: ResourceIntroducer[];
  groups: ResourceGroup[];
  attractapReaders: Attractap[];
  maintenances: ResourceMaintenance[];
  maintenanceSchedules: ResourceMaintenanceSchedule[];
  billingConfigurations: ResourceBillingConfiguration[];
  forms: Form[];
}
