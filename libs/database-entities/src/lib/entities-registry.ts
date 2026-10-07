import { AuditLog } from './entities/audit-log.entity';
import { User } from './entities/user.entity';
import { AuthenticationDetail } from './entities/authenticationDetail.entity';
import { Session } from './entities/session.entity';
import { Resource } from './entities/resource.entity';
import { ResourceGroup } from './entities/resourceGroup.entity';
import { ResourceUsage } from './entities/resourceUsage.entity';
import { ResourceIntroduction } from './entities/resourceIntroduction.entity';
import { ResourceIntroducer } from './entities/resourceIntroducer.entity';
import { ResourceIntroductionHistoryItem } from './entities/resourceIntroductionHistoryItem.entity';
import { MqttServer } from './entities/mqttServer.entity';
import { SSOProvider } from './entities/ssoProvider.entity';
import { SSOProviderOIDCConfiguration } from './entities/ssoProvider.oidc';
import { SSOProviderSAMLConfiguration } from './entities/ssoProvider.saml';
import { NFCCard } from './entities/rfidCard.entity';
import { Attractap } from './entities/attractap.entity';
import { AttractapCrashReport } from './entities/attractapCrashReport.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailTemplateTranslation } from './entities/email-template-translation.entity';
import { ResourceFlowNode } from './entities/resourceFlowNode';
import { ResourceFlowEdge } from './entities/resourceFlowEdge';
import { ResourceMaintenance } from './entities/resource.maintenance';
import { ResourceMaintenanceRequest } from './entities/resource-maintenance-request.entity';
import { ResourceMaintenanceSchedule } from './entities/resource-maintenance-schedule.entity';
import { ResourceMaintenanceScheduleUsageHoursConfig } from './entities/resource-maintenance-schedule-usage-hours-config.entity';
import { ResourceMaintenanceScheduleUsageCountConfig } from './entities/resource-maintenance-schedule-usage-count-config.entity';
import { ResourceMaintenanceScheduleTimeIntervalConfig } from './entities/resource-maintenance-schedule-time-interval-config.entity';
import { BillingTransaction } from './entities/billing-transaction.entity';
import { ResourceBillingConfiguration } from './entities/resource-billing-configuration.entity';
import { Setting } from './entities/setting.entity';
import { BillingTransactionItem } from './entities/billing-transaction-item.entity';
import { Project } from './entities/project';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectInvitation } from './entities/project-invitation.entity';
import { Form, FormField, FormSubmission } from './entities/form';
import { ResourceHealthState } from './entities/resourceHealthState.entity';
import { ResourceFlowVariable } from './entities/resourceFlowVariable';
import { PasswordPolicy } from './entities/password-policy.entity';
import { PasswordHistory } from './entities/password-history.entity';
import { PasswordPolicyOverride } from './entities/password-policy-override.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { Passkey, PasskeyChallenge } from './entities/passkey.entity';
import { CompanionDevice } from './entities/companion-device.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';
import { ApiToken } from './entities/api-token.entity';
import { ApiTokenPermission } from './entities/api-token-permission.entity';
import { ResourceOperatingInterval } from './entities/resource-operating-interval.entity';
import { ResourceUsageLifecycleAttempt } from './entities/resource-usage-lifecycle-attempt.entity';
import { ResourceMeteringSession, ResourceMeteringOperation } from './entities/resource-metering.entity';
import { ResourceMeter } from './entities/resource-meter.entity';

export const entities = {
  AuditLog,
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
  ResourceUsageLifecycleAttempt,
  ResourceMeteringSession,
  ResourceMeteringOperation,
  ResourceMeter,
};
