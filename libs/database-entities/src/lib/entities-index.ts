// Import entities
import { EmailTemplate } from './entities/email-template.entity';
import { AuthenticationDetail } from './entities/authenticationDetail.entity';
import { MqttServer } from './entities/mqttServer.entity';
import { NFCCard } from './entities/nfcCard.entity';
import { Resource } from './entities/resource.entity';
import { ResourceType } from './entities/resource.type';
import { ResourceGroup } from './entities/resourceGroup.entity';
import { ResourceIntroduction } from './entities/resourceIntroduction.entity';
import {
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
} from './entities/resourceIntroductionHistoryItem.entity';
import { ResourceIntroducer } from './entities/resourceIntroducer.entity';
import { ResourceUsage } from './entities/resourceUsage.entity';
import { SSOProvider, SSOProviderType } from './entities/ssoProvider.entity';
import { SSOProviderOIDCConfiguration } from './entities/ssoProvider.oidc';
import { SSOProviderSAMLConfiguration } from './entities/ssoProvider.saml';
import { User, SystemPermissions, type SystemPermission } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { Attractap, AttractapFirmwareVersion } from './entities/attractap.entity';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  getNodeDataSchema,
  NodeWithoutDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  ButtonNodeDataSchema,
  IfNodeDataSchema,
  BillingTransactionItemCreateSchema,
  SetPayloadNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  ErrorNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  HealthStateOptionEnum,
} from './entities/resourceFlowNode';
import {
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceHealthSource,
} from './entities/resourceHealthState.entity';
import { ResourceFlowEdge } from './entities/resourceFlowEdge';
import { ResourceFlowLog, ResourceFlowLogType } from './entities/resourceFlowLog';
import { ResourceMaintenance } from './entities/resource.maintenance';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from './entities/resource-maintenance-schedule.entity';
import {
  ResourceMaintenanceScheduleUsageHoursConfig,
} from './entities/resource-maintenance-schedule-usage-hours-config.entity';
import { UsageDurationUnit } from './types/usageDurationUnit.enum';
import { ResourceMaintenanceScheduleUsageCountConfig } from './entities/resource-maintenance-schedule-usage-count-config.entity';
import { ResourceMaintenanceScheduleTimeIntervalConfig } from './entities/resource-maintenance-schedule-time-interval-config.entity';
import { ResourceUsageAction } from './entities/resourceUsage.type';
import { BillingTransaction, BillingTransactionStatus } from './entities/billing-transaction.entity';
import { ResourceBillingConfiguration } from './entities/resource-billing-configuration.entity';
import { Setting } from './entities/setting.entity';
import { BillingTransactionItem } from './entities/billing-transaction-item.entity';
import { Project } from './entities/project';
import { ProjectMember, ProjectMemberRole } from './entities/project-member.entity';
import { ProjectInvitation, ProjectInvitationStatus } from './entities/project-invitation.entity';
import { Form, FormField, FormSubmission, FormFieldType, ResourceFormAction } from './entities/form';
import { PasswordPolicy, PASSWORD_POLICY_SINGLETON_ID } from './entities/password-policy.entity';
import { PasswordHistory } from './entities/password-history.entity';

// Export all entities individually
export {
  AuthenticationDetail,
  MqttServer,
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  ResourceIntroducer,
  ResourceUsage,
  SSOProvider,
  SSOProviderType,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  User,
  SystemPermissions,
  SystemPermission,
  Session,
  NFCCard,
  Attractap,
  EmailTemplate,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowEdge,
  getNodeDataSchema,
  NodeWithoutDataSchema as EventNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  ResourceFlowLog,
  ResourceFlowLogType,
  AttractapFirmwareVersion,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageHoursConfig,
  UsageDurationUnit,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceType,
  ResourceUsageAction,
  ButtonNodeDataSchema,
  IfNodeDataSchema,
  SetPayloadNodeDataSchema,
  BillingTransaction,
  ResourceBillingConfiguration,
  Setting,
  BillingTransactionStatus,
  BillingTransactionItem,
  BillingTransactionItemCreateSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  ErrorNodeDataSchema,
  Project,
  ProjectMember,
  ProjectMemberRole,
  ProjectInvitation,
  ProjectInvitationStatus,
  Form,
  FormField,
  FormSubmission,
  FormFieldType,
  ResourceFormAction,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  HealthStateOptionEnum,
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceHealthSource,
  PasswordPolicy,
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordHistory,
};

// Export the entities object
export const entities = {
  User,
  AuthenticationDetail,
  Session,
  Resource,
  ResourceGroup,
  ResourceUsage,
  ResourceIntroduction,
  ResourceIntroducer,
  ResourceIntroductionHistoryItem,
  MqttServer,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  NFCCard,
  Attractap,
  EmailTemplate,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowLog,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  BillingTransaction,
  ResourceBillingConfiguration,
  Setting,
  BillingTransactionItem,
  Project,
  ProjectMember,
  ProjectInvitation,
  Form,
  FormField,
  FormSubmission,
  ResourceHealthState,
  PasswordPolicy,
  PasswordHistory,
};
