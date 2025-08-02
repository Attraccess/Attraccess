// Import entities
import { EmailTemplate } from './entities/email-template.entity';
import { AuthenticationDetail } from './entities/authenticationDetail.entity';
import { MqttServer } from './entities/mqttServer.entity';
import { NFCCard } from './entities/nfcCard.entity';
import { Resource, ResourceComputedView } from './entities/resource.entity';
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
} from './entities/resourceFlowNode';
import { ResourceFlowEdge } from './entities/resourceFlowEdge';
import { ResourceFlowLog, ResourceFlowLogType } from './entities/resourceFlowLog';
import { ResourceMaintenance } from './entities/resource.maintenance';

// Export all entities individually
export {
  AuthenticationDetail,
  MqttServer,
  Resource,
  ResourceComputedView,
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
};

// Export the entities object
export const entities = {
  User,
  AuthenticationDetail,
  RevokedToken,
  Session,
  Resource,
  ResourceComputedView,
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
};
