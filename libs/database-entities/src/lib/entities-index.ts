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
import { RevokedToken } from './entities/revokedToken.entity';
import { SSOProvider, SSOProviderType } from './entities/ssoProvider.entity';
import { SSOProviderOIDCConfiguration } from './entities/ssoProvider.oidc';
import { User, SystemPermissions, type SystemPermission } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { Attractap, AttractapFirmwareVersion } from './entities/attractap.entity';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  getNodeDataSchema,
  EventNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  ResourceFlowNodeData,
  ResourceFlowActionHttpSendRequestNodeData,
  ResourceFlowActionMqttSendMessageNodeData,
  ResourceFlowActionUtilWaitNodeData,
  ResourceFlowActionIfNodeData,
  ButtonNodeDataSchema,
  IfNodeDataSchema,
} from './entities/resourceFlowNode';
import { ResourceFlowEdge } from './entities/resourceFlowEdge';
import { ResourceFlowLog, ResourceFlowLogType } from './entities/resourceFlowLog';
import { ResourceMaintenance } from './entities/resource.maintenance';
import { ResourceUsageAction } from './entities/resourceUsage.type';
import { BillingTransaction } from './entities/billing-transaction.entity';
import { ResourceBillingConfiguration } from './entities/resource-billing-configuration.entity';

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
  RevokedToken,
  SSOProvider,
  SSOProviderType,
  SSOProviderOIDCConfiguration,
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
  EventNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  ResourceFlowNodeData,
  ResourceFlowLog,
  ResourceFlowLogType,
  ResourceFlowActionHttpSendRequestNodeData,
  ResourceFlowActionMqttSendMessageNodeData,
  ResourceFlowActionUtilWaitNodeData,
  AttractapFirmwareVersion,
  ResourceMaintenance,
  ResourceFlowActionIfNodeData,
  ResourceType,
  ResourceUsageAction,
  ButtonNodeDataSchema,
  IfNodeDataSchema,
  BillingTransaction,
  ResourceBillingConfiguration,
};

// Export the entities object
export const entities = {
  User,
  AuthenticationDetail,
  RevokedToken,
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
  NFCCard,
  Attractap,
  EmailTemplate,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowLog,
  ResourceMaintenance,
  BillingTransaction,
  ResourceBillingConfiguration,
};
