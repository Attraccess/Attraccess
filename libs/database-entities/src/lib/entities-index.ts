// Import entities
import { EmailTemplate } from './entities/email-template.entity';
import { EmailTemplateTranslation } from './entities/email-template-translation.entity';
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
import { ResourceIntroducer, ResourceIntroducerType } from './entities/resourceIntroducer.entity';
import { ResourceUsage } from './entities/resourceUsage.entity';
import { SupervisionMode, AutoIntroductionTarget } from './entities/resource.supervision';
import { SSOProvider, SSOProviderType } from './entities/ssoProvider.entity';
import { SSOProviderOIDCConfiguration } from './entities/ssoProvider.oidc';
import { SSOProviderSAMLConfiguration } from './entities/ssoProvider.saml';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { Attractap, AttractapFirmwareVersion } from './entities/attractap.entity';
import { AttractapCrashReport } from './entities/attractapCrashReport.entity';
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
  ResourceOperatingTransitionNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  HealthStateOptionEnum,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
  VariableScopeSchema,
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
  getExternalEffectFailureBehavior,
} from './entities/resourceFlowNode';
import { ResourceHealthState, ResourceHealthStatus, ResourceHealthSource } from './entities/resourceHealthState.entity';
import { ResourceFlowEdge } from './entities/resourceFlowEdge';
import { ResourceMaintenance } from './entities/resource.maintenance';
import { ResourceMaintenanceRequest, MaintenanceRequestStatus } from './entities/resource-maintenance-request.entity';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from './entities/resource-maintenance-schedule.entity';
import { ResourceMaintenanceScheduleUsageHoursConfig } from './entities/resource-maintenance-schedule-usage-hours-config.entity';
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
import {
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  type ResourceFlowVariableValueType,
} from './entities/resourceFlowVariable';
import { PasswordPolicy, PASSWORD_POLICY_SINGLETON_ID } from './entities/password-policy.entity';
import { PasswordHistory } from './entities/password-history.entity';
import {
  PasswordPolicyOverride,
  PasswordPolicyRole,
  PASSWORD_POLICY_ROLES,
} from './entities/password-policy-override.entity';
import { PasswordPolicyAudit, PasswordPolicyAuditEvent } from './entities/password-policy-audit.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message, MessageReferenceType } from './entities/message.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { Passkey, PasskeyChallenge } from './entities/passkey.entity';
import { CompanionDevice } from './entities/companion-device.entity';
import { EmailLayout, EMAIL_LAYOUT_SINGLETON_ID } from './entities/email-layout.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole, UserRoleSource } from './entities/user-role.entity';
import { ApiToken } from './entities/api-token.entity';
import { ApiTokenPermission } from './entities/api-token-permission.entity';
import { ResourceOperatingInterval } from './entities/resource-operating-interval.entity';

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
  ResourceIntroducerType,
  ResourceUsage,
  SSOProvider,
  SSOProviderType,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  User,
  Session,
  NFCCard,
  Attractap,
  AttractapCrashReport,
  EmailTemplate,
  EmailTemplateTranslation,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowEdge,
  getNodeDataSchema,
  NodeWithoutDataSchema as EventNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  AttractapFirmwareVersion,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  MaintenanceRequestStatus,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageHoursConfig,
  UsageDurationUnit,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceType,
  SupervisionMode,
  AutoIntroductionTarget,
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
  getExternalEffectFailureBehavior,
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
  ResourceOperatingTransitionNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  HealthStateOptionEnum,
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceHealthSource,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  type ResourceFlowVariableValueType,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
  VariableScopeSchema,
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
  PasswordPolicy,
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordHistory,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  PASSWORD_POLICY_ROLES,
  PasswordPolicyAudit,
  PasswordPolicyAuditEvent,
  Conversation,
  ConversationParticipant,
  Message,
  MessageReferenceType,
  NotificationPreference,
  PushSubscription,
  Passkey,
  PasskeyChallenge,
  CompanionDevice,
  EmailLayout,
  EMAIL_LAYOUT_SINGLETON_ID,
  Permission,
  Role,
  RolePermission,
  UserRole,
  UserRoleSource,
  ApiToken,
  ApiTokenPermission,
  ResourceOperatingInterval,
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
  AttractapCrashReport,
  EmailTemplate,
  EmailTemplateTranslation,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
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
  ResourceFlowVariable,
  PasswordPolicy,
  PasswordHistory,
  PasswordPolicyOverride,
  PasswordPolicyAudit,
  Conversation,
  ConversationParticipant,
  Message,
  NotificationPreference,
  PushSubscription,
  Passkey,
  PasskeyChallenge,
  CompanionDevice,
  Permission,
  Role,
  RolePermission,
  UserRole,
  ApiToken,
  ApiTokenPermission,
  ResourceOperatingInterval,
};
