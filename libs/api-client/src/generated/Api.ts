/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

/** Template type/key used by the system */
export enum EmailTemplateType {
  VerifyEmail = "verify-email",
  ResetPassword = "reset-password",
  UsernameChanged = "username-changed",
  PasswordChanged = "password-changed",
}

/** The type of the provider */
export enum SSOProviderType {
  OIDC = "OIDC",
}

export interface CreateUserDto {
  /**
   * The username for the new user
   * @example "johndoe"
   */
  username: string;
  /**
   * The email address for the new user
   * @example "john.doe@example.com"
   */
  email: string;
  /**
   * The password for the new user
   * @example "password123"
   */
  password: string;
  /**
   * The authentication strategy to use
   * @example "local_password"
   */
  strategy: "local_password" | "sso";
}

export interface SystemPermissions {
  /**
   * Whether the user can manage resources
   * @example false
   */
  canManageResources: boolean;
  /**
   * Whether the user can manage system configuration
   * @example false
   */
  canManageSystemConfiguration: boolean;
  /**
   * Whether the user can manage users
   * @example false
   */
  canManageUsers: boolean;
  /**
   * Whether the user can manage billing
   * @example false
   */
  canManageBilling: boolean;
}

export interface User {
  /**
   * The unique identifier of the user
   * @example 1
   */
  id: number;
  /**
   * The username of the user
   * @example "johndoe"
   */
  username: string;
  /**
   * Whether the user has verified their email address
   * @example true
   */
  isEmailVerified: boolean;
  /**
   * System-wide permissions for the user
   * @example {"canManageResources":true,"canManageSystemConfiguration":false,"canManageUsers":false}
   */
  systemPermissions: SystemPermissions;
  /**
   * When the user was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the user was last updated
   * @format date-time
   */
  updatedAt: string;
  /**
   * The external (origin) identifier of the user, if the user is authenticated via SSO
   * @example "1234567890"
   */
  externalIdentifier?: string | null;
  /** The credit balance of the user */
  creditBalance: number;
}

export interface VerifyEmailDto {
  /**
   * The token to verify the email
   * @example "1234567890"
   */
  token: string;
  /**
   * The email to verify
   * @example "john.doe@example.com"
   */
  email: string;
}

export type ResetPasswordDto = object;

export interface ChangePasswordDto {
  /**
   * The new password for the user
   * @example "password123"
   */
  password: string;
  /**
   * The token for the user
   * @example "1234567890"
   */
  token: string;
}

export interface ChangeUsernameDto {
  /**
   * The new username
   * @example "new_handle"
   */
  username: string;
}

export type UserNotFoundException = object;

export interface PaginatedUsersResponseDto {
  total: number;
  page: number;
  limit: number;
  data: User[];
}

export interface UpdateUserPermissionsDto {
  /**
   * Whether the user can manage resources
   * @example false
   */
  canManageResources?: boolean;
  /**
   * Whether the user can manage system configuration
   * @example false
   */
  canManageSystemConfiguration?: boolean;
  /**
   * Whether the user can manage users
   * @example false
   */
  canManageUsers?: boolean;
}

export interface UserPermissionsUpdateItem {
  /**
   * The user ID
   * @example 1
   */
  userId: number;
  /**
   * The permission updates to apply
   * @example {"canManageResources":true,"canManageSystemConfiguration":false,"canManageUsers":false}
   */
  permissions: UpdateUserPermissionsDto;
}

export interface BulkUpdateUserPermissionsDto {
  /** Array of user permission updates */
  updates: UserPermissionsUpdateItem[];
}

export interface SetUserPasswordDto {
  /**
   * The new password for the user
   * @example "newSecurePassword123"
   */
  password: string;
}

export interface CreateSessionResponse {
  /**
   * The user that has been logged in
   * @example {"id":1,"username":"testuser"}
   */
  user: User;
  /**
   * The authentication token
   * @example "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
   */
  authToken: string;
}

export interface SSOProviderOIDCConfiguration {
  /**
   * The unique identifier of the provider
   * @example 1
   */
  id: number;
  /**
   * The ID of the SSO provider
   * @example 1
   */
  ssoProviderId: number;
  /**
   * The issuer of the provider
   * @example "https://sso.csh.rit.edu/auth/realms/csh"
   */
  issuer: string;
  /**
   * The authorization URL of the provider
   * @example "https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/auth"
   */
  authorizationURL: string;
  /**
   * The token URL of the provider
   * @example "https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/token"
   */
  tokenURL: string;
  /**
   * The user info URL of the provider
   * @example "https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/userinfo"
   */
  userInfoURL: string;
  /**
   * The client ID of the provider
   * @example "1234567890"
   */
  clientId: string;
  /**
   * The client secret of the provider
   * @example "1234567890"
   */
  clientSecret: string;
  /**
   * When the user was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the user was last updated
   * @format date-time
   */
  updatedAt: string;
}

export interface SSOProvider {
  /**
   * The unique identifier of the provider
   * @example 1
   */
  id: number;
  /**
   * The internal name of the provider
   * @example "Keycloak"
   */
  name: string;
  /**
   * The type of the provider
   * @example "OIDC"
   */
  type: SSOProviderType;
  /**
   * When the user was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the user was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The OIDC configuration of the provider */
  oidcConfiguration: SSOProviderOIDCConfiguration;
}

export interface LinkUserToExternalAccountRequestDto {
  /**
   * The email of the user
   * @example "john.doe@example.com"
   */
  email: string;
  /**
   * The password of the user
   * @example "password"
   */
  password: string;
  /**
   * The external identifier of the user
   * @example "1234567890"
   */
  externalId: string;
}

export interface CreateOIDCConfigurationDto {
  /**
   * The issuer of the provider
   * @example "https://sso.example.com/auth/realms/example"
   */
  issuer: string;
  /**
   * The authorization URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/auth"
   */
  authorizationURL: string;
  /**
   * The token URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/token"
   */
  tokenURL: string;
  /**
   * The user info URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo"
   */
  userInfoURL: string;
  /**
   * The client ID of the provider
   * @example "attraccess-client"
   */
  clientId: string;
  /**
   * The client secret of the provider
   * @example "client-secret"
   */
  clientSecret: string;
}

export interface CreateSSOProviderDto {
  /**
   * The name of the SSO provider
   * @example "Company Keycloak"
   */
  name: string;
  /**
   * The type of SSO provider
   * @example "OIDC"
   */
  type: "OIDC";
  /** The OIDC configuration for the provider */
  oidcConfiguration?: CreateOIDCConfigurationDto;
}

export interface UpdateOIDCConfigurationDto {
  /**
   * The issuer of the provider
   * @example "https://sso.example.com/auth/realms/example"
   */
  issuer?: string;
  /**
   * The authorization URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/auth"
   */
  authorizationURL?: string;
  /**
   * The token URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/token"
   */
  tokenURL?: string;
  /**
   * The user info URL of the provider
   * @example "https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo"
   */
  userInfoURL?: string;
  /**
   * The client ID of the provider
   * @example "attraccess-client"
   */
  clientId?: string;
  /**
   * The client secret of the provider
   * @example "client-secret"
   */
  clientSecret?: string;
}

export interface UpdateSSOProviderDto {
  /**
   * The name of the SSO provider
   * @example "Company Keycloak"
   */
  name?: string;
  /** The OIDC configuration for the provider */
  oidcConfiguration?: UpdateOIDCConfigurationDto;
}

export interface PreviewMjmlDto {
  /**
   * The MJML content to preview
   * @example "<mjml><mj-body><mj-section><mj-column><mj-text>Hello, world!</mj-text></mj-column></mj-section></mj-body></mjml>"
   */
  mjmlContent: string;
}

export interface PreviewMjmlResponseDto {
  /**
   * The HTML content of the MJML
   * @example "<div>Hello, world!</div>"
   */
  html: string;
  /**
   * Indicates if there were any errors during conversion
   * @example false
   */
  hasErrors: boolean;
  /**
   * Error message if conversion failed
   * @example null
   */
  error?: string;
}

export interface EmailTemplate {
  /**
   * Template type/key used by the system
   * @example "verify-email"
   */
  type: EmailTemplateType;
  /**
   * Email subject line
   * @example "Verify Your Email Address"
   */
  subject: string;
  /** MJML content of the email body */
  body: string;
  /**
   * Variables used in the email body
   * @example ["{{name}}","{{url}}"]
   */
  variables: string[];
  /**
   * Timestamp of when the template was created
   * @format date-time
   */
  createdAt: string;
  /**
   * Timestamp of when the template was last updated
   * @format date-time
   */
  updatedAt: string;
}

export interface UpdateEmailTemplateDto {
  /**
   * Email subject line
   * @maxLength 255
   */
  subject?: string;
  /** MJML content of the email body */
  body?: string;
}

export interface LicenseDataDto {
  /** Whether the license is valid */
  valid: boolean;
  /** Reason for invalidity when not valid */
  reason?: string;
  /**
   * The raw payload as returned by the license server
   * @example ["attractap","sso"]
   */
  modules: string[];
  /** The raw payload as returned by the license server */
  usageLimits: Record<string, any>;
  /** Are you using this software for free as a non-profit? */
  isNonProfit: boolean;
}

export interface CreateResourceDto {
  /**
   * The name of the resource
   * @example "3D Printer"
   */
  name: string;
  /**
   * The type of the resource
   * @example "machine"
   */
  type: "machine" | "door";
  /**
   * (only for doors) wheter the door needs seperate actions for unlocking and unlatching
   * @default false
   * @example false
   */
  separateUnlockAndUnlatch?: boolean;
  /**
   * A detailed description of the resource
   * @example "Prusa i3 MK3S+ 3D printer with 0.4mm nozzle"
   */
  description?: string;
  /**
   * Resource image file
   * @format binary
   */
  image?: File;
  /**
   * The type of documentation (markdown or url)
   * @example "markdown"
   */
  documentationType?: "markdown" | "url";
  /**
   * Markdown content for resource documentation
   * @example "# Resource Documentation
   *
   * This is a markdown documentation for the resource."
   */
  documentationMarkdown?: string;
  /**
   * URL to external documentation
   * @example "https://example.com/documentation"
   */
  documentationUrl?: string;
  /**
   * Whether this resource allows overtaking by the next user without the prior user ending their session
   * @default false
   * @example false
   */
  allowTakeOver?: boolean;
}

export interface ResourceGroup {
  /**
   * The unique identifier of the resource group
   * @example 1
   */
  id: number;
  /**
   * The name of the resource
   * @example "3D Printer"
   */
  name: string;
  /**
   * A detailed description of the resource
   * @example "Prusa i3 MK3S+ 3D printer with 0.4mm nozzle"
   */
  description?: string;
  /**
   * When the resource was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the resource was last updated
   * @format date-time
   */
  updatedAt: string;
}

export interface Resource {
  /**
   * The unique identifier of the resource
   * @example 1
   */
  id: number;
  /**
   * The name of the resource
   * @example "3D Printer"
   */
  name: string;
  /**
   * The type of the resource
   * @example "machine"
   */
  type: "machine" | "door";
  /**
   * (only for doors) wheter the door needs seperate actions for unlocking and unlatching
   * @default false
   * @example false
   */
  separateUnlockAndUnlatch: boolean;
  /**
   * A detailed description of the resource
   * @example "Prusa i3 MK3S+ 3D printer with 0.4mm nozzle"
   */
  description?: string;
  /**
   * The filename of the resource image
   * @example "1234567890_abcdef.jpg"
   */
  imageFilename?: string;
  /**
   * The type of documentation (markdown or url)
   * @example "markdown"
   */
  documentationType?: "markdown" | "url";
  /**
   * Markdown content for resource documentation
   * @example "# Resource Documentation
   *
   * This is a markdown documentation for the resource."
   */
  documentationMarkdown?: string;
  /**
   * URL to external documentation
   * @example "https://example.com/documentation"
   */
  documentationUrl?: string;
  /**
   * Whether this resource allows overtaking by the next user without the prior user ending their session
   * @default false
   * @example false
   */
  allowTakeOver: boolean;
  /**
   * When the resource was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the resource was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The groups the resource belongs to */
  groups: ResourceGroup[];
}

export interface PaginatedResourceResponseDto {
  total: number;
  page: number;
  limit: number;
  data: Resource[];
}

export interface UpdateResourceDto {
  /**
   * The name of the resource
   * @example "3D Printer"
   */
  name?: string;
  /**
   * The type of the resource
   * @example "machine"
   */
  type?: "machine" | "door";
  /**
   * (only for doors) wheter the door needs seperate actions for unlocking and unlatching
   * @default false
   * @example false
   */
  separateUnlockAndUnlatch?: boolean;
  /**
   * A detailed description of the resource
   * @example "Prusa i3 MK3S+ 3D printer with 0.4mm nozzle"
   */
  description?: string;
  /**
   * New resource image file
   * @format binary
   */
  image?: File;
  /**
   * Whether the resource image should be deleted
   * @default false
   */
  deleteImage?: boolean;
  /**
   * The type of documentation (markdown or url)
   * @example "markdown"
   */
  documentationType?: "markdown" | "url";
  /**
   * Markdown content for resource documentation
   * @example "# Resource Documentation
   *
   * This is a markdown documentation for the resource."
   */
  documentationMarkdown?: string;
  /**
   * URL to external documentation
   * @example "https://example.com/documentation"
   */
  documentationUrl?: string;
  /**
   * Whether this resource allows overtaking by the next user without the prior user ending their session
   * @example false
   */
  allowTakeOver?: boolean;
}

export interface MqttServer {
  /**
   * The unique identifier of the MQTT server
   * @example 1
   */
  id: number;
  /**
   * Friendly name for the MQTT server
   * @example "Workshop MQTT Server"
   */
  name: string;
  /**
   * MQTT server hostname/IP
   * @example "mqtt.example.com"
   */
  host: string;
  /**
   * MQTT server port (default: 1883 for MQTT, 8883 for MQTTS)
   * @example 1883
   */
  port: number;
  /**
   * Optional authentication username
   * @example "mqttuser"
   */
  username?: string;
  /**
   * Optional authentication password
   * @example "password123"
   */
  password?: string;
  /**
   * Client ID for MQTT connection
   * @example "attraccess-client-1"
   */
  clientId?: string;
  /**
   * Whether to use TLS/SSL
   * @example false
   */
  useTls: boolean;
  /**
   * When the MQTT server was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the MQTT server was last updated
   * @format date-time
   */
  updatedAt: string;
}

export interface CreateMqttServerDto {
  /** Friendly name for the MQTT server */
  name: string;
  /** Hostname or IP address of the MQTT server */
  host: string;
  /**
   * Port number of the MQTT server
   * @example 1883
   */
  port: number;
  /** Optional username for authentication */
  username?: string;
  /** Optional password for authentication */
  password?: string;
  /** Optional client ID for MQTT connection */
  clientId?: string;
  /**
   * Whether to use TLS/SSL for the connection
   * @default false
   */
  useTls?: boolean;
}

export interface UpdateMqttServerDto {
  /** Friendly name for the MQTT server */
  name?: string;
  /** Hostname or IP address of the MQTT server */
  host?: string;
  /**
   * Port number of the MQTT server
   * @example 1883
   */
  port?: number;
  /** Optional username for authentication */
  username?: string;
  /** Optional password for authentication */
  password?: string;
  /** Optional client ID for MQTT connection */
  clientId?: string;
  /**
   * Whether to use TLS/SSL for the connection
   * @default false
   */
  useTls?: boolean;
}

export interface TestConnectionResponseDto {
  /**
   * Whether the connection test was successful
   * @example true
   */
  success: boolean;
  /**
   * Message describing the test result
   * @example "Connection successful"
   */
  message: string;
}

export interface MqttHealthStatusDto {
  /**
   * Whether the connection is healthy
   * @example true
   */
  healthy: boolean;
  /**
   * Detailed health status message
   * @example "Connected: true, Failures: 0/3, Messages: 10 sent, 0 failed"
   */
  details: string;
}

export interface MqttConnectionStatsDto {
  /**
   * Number of connection attempts
   * @example 5
   */
  connectionAttempts: number;
  /**
   * Number of failed connections
   * @example 1
   */
  connectionFailures: number;
  /**
   * Number of successful connections
   * @example 4
   */
  connectionSuccesses: number;
  /**
   * Timestamp of last successful connection
   * @format date-time
   * @example "2023-01-01T12:00:00.000Z"
   */
  lastConnectTime?: string;
  /**
   * Timestamp of last disconnection
   * @format date-time
   * @example "2023-01-01T12:30:00.000Z"
   */
  lastDisconnectTime?: string;
}

export interface MqttMessageStatsDto {
  /**
   * Number of successfully published messages
   * @example 42
   */
  published: number;
  /**
   * Number of failed message publications
   * @example 3
   */
  failed: number;
  /**
   * Timestamp of last successful message publication
   * @format date-time
   * @example "2023-01-01T12:15:00.000Z"
   */
  lastPublishTime?: string;
  /**
   * Timestamp of last failed message publication
   * @format date-time
   * @example "2023-01-01T12:10:00.000Z"
   */
  lastFailureTime?: string;
}

export interface MqttServerStatsDto {
  /** Connection statistics */
  connection: MqttConnectionStatsDto;
  /** Message statistics */
  messages: MqttMessageStatsDto;
}

export interface MqttServerStatusDto {
  /**
   * Whether the server is currently connected
   * @example true
   */
  connected: boolean;
  /** Health status of the connection */
  healthStatus: MqttHealthStatusDto;
  /** Detailed statistics */
  stats: MqttServerStatsDto;
}

export interface AllMqttServerStatusesDto {
  /** Map of server IDs to their statuses */
  servers: Record<string, MqttServerStatusDto>;
}

export interface CreateResourceGroupDto {
  /**
   * The name of the resource group
   * @example "Resource Group 1"
   */
  name: string;
  /**
   * The description of the resource group
   * @example "This is a resource group"
   */
  description?: string;
}

export interface UpdateResourceGroupDto {
  /**
   * The name of the resource group
   * @example "Resource Group 1"
   */
  name: string;
  /**
   * The description of the resource group
   * @example "This is a resource group"
   */
  description?: string;
}

export interface ResourceIntroductionHistoryItem {
  /**
   * The unique identifier of the introduction history entry
   * @example 1
   */
  id: number;
  /**
   * The ID of the related introduction
   * @example 1
   */
  introductionId: number;
  /**
   * The action performed (revoke or grant)
   * @example "revoke"
   */
  action: "revoke" | "grant";
  /**
   * The ID of the user who performed the action
   * @example 1
   */
  performedByUserId: number;
  /**
   * Optional comment explaining the reason for the action
   * @example "User no longer requires access to this resource"
   */
  comment?: string;
  /**
   * When the action was performed
   * @format date-time
   * @example "2021-01-01T00:00:00.000Z"
   */
  createdAt: string;
  /** The user who performed the action */
  performedByUser: User;
}

export interface ResourceIntroduction {
  /**
   * The unique identifier of the introduction
   * @example 1
   */
  id: number;
  /**
   * The ID of the resource (if this is a resource-specific introduction)
   * @example 1
   */
  resourceId?: number;
  /**
   * The ID of the user who received the introduction
   * @example 1
   */
  receiverUserId: number;
  /**
   * The ID of the user who tutored the receiver
   * @example 2
   */
  tutorUserId: number;
  /**
   * The ID of the resource group (if this is a group-level introduction)
   * @example 1
   */
  resourceGroupId?: number;
  /**
   * When the introduction was completed
   * @format date-time
   * @example "2021-01-01T00:00:00.000Z"
   */
  completedAt: string;
  /**
   * When the introduction record was created
   * @format date-time
   * @example "2021-01-01T00:00:00.000Z"
   */
  createdAt: string;
  /** The user who received the introduction */
  receiverUser: User;
  /** The user who tutored the receiver */
  tutorUser: User;
  /** History of revoke/unrevoke actions for this introduction */
  history: ResourceIntroductionHistoryItem[];
}

export interface UpdateResourceGroupIntroductionDto {
  /**
   * The comment for the action
   * @example "This is a comment"
   */
  comment?: string;
}

export interface ResourceIntroducer {
  /**
   * The unique identifier of the introduction permission
   * @example 1
   */
  id: number;
  /**
   * The ID of the resource (if permission is for a specific resource)
   * @example 1
   */
  resourceId?: number;
  /**
   * The ID of the user who can give introductions
   * @example 1
   */
  userId: number;
  /**
   * The ID of the resource group (if permission is for a group)
   * @example 1
   */
  resourceGroupId?: number;
  /**
   * When the permission was granted
   * @format date-time
   */
  grantedAt: string;
  /** The user who can give introductions */
  user: User;
}

export interface IsResourceGroupIntroducerResponseDto {
  /** Whether the user is an introducer for the resource */
  isIntroducer: boolean;
}

export interface StartUsageSessionDto {
  /**
   * Optional notes about the usage session
   * @example "Printing a prototype case"
   */
  notes?: string;
  /**
   * Whether to force takeover of an existing session (only works if resource allows takeover)
   * @default false
   * @example false
   */
  forceTakeOver?: boolean;
}

export interface ResourceUsage {
  /**
   * The unique identifier of the resource usage
   * @example 1
   */
  id: number;
  /**
   * The type of usage
   * @example "usage"
   */
  usageAction: "usage" | "door.lock" | "door.unlock" | "door.unlatch";
  /**
   * The ID of the resource being used
   * @example 1
   */
  resourceId: number;
  /**
   * The ID of the user using the resource (null if user was deleted)
   * @example 1
   */
  userId?: number;
  /**
   * When the usage session started
   * @format date-time
   */
  startTime: string;
  /**
   * Notes provided when starting the session
   * @example "Starting prototype development for client XYZ"
   */
  startNotes?: string;
  /**
   * When the usage session ended
   * @format date-time
   */
  endTime?: string;
  /**
   * Notes provided when ending the session
   * @example "Completed initial prototype, material usage: 500g"
   */
  endNotes?: string;
  /** The resource being used */
  resource?: Resource;
  /** The user who used the resource */
  user?: User;
  /**
   * The duration of the usage session in minutes
   * @example 120
   */
  usageInMinutes: number;
}

export interface EndUsageSessionDto {
  /**
   * Additional notes about the completed session
   * @example "Print completed successfully"
   */
  notes?: string;
  /**
   * The end time of the session. If not provided, current time will be used.
   * @format date-time
   */
  endTime?: string;
}

export interface GetResourceHistoryResponseDto {
  total: number;
  page: number;
  limit: number;
  data: ResourceUsage[];
}

export interface GetActiveUsageSessionDto {
  /** The active usage session or null if none exists */
  usage: ResourceUsage | null;
}

export interface CanControlResponseDto {
  /** Whether the user can control the resource */
  canControl: boolean;
}

export interface IsResourceIntroducerResponseDto {
  /** Whether the user is an introducer for the resource */
  isIntroducer: boolean;
}

export interface UpdateResourceIntroductionDto {
  /**
   * The comment for the action
   * @example "This is a comment"
   */
  comment?: string;
}

export interface CanManageMaintenanceResponseDto {
  /**
   * Whether the user can manage maintenance for the resource
   * @example true
   */
  canManage: boolean;
  /**
   * The resource ID that was checked
   * @example 123
   */
  resourceId: number;
}

export interface CreateMaintenanceDto {
  /**
   * When the maintenance starts (must be in the future)
   * @format date-time
   * @example "2025-01-01T10:00:00.000Z"
   */
  startTime: string;
  /**
   * When the maintenance ends (optional)
   * @format date-time
   * @example "2025-01-01T18:00:00.000Z"
   */
  endTime?: string;
  /**
   * The reason for the maintenance
   * @example "Scheduled maintenance for software updates"
   */
  reason?: string;
}

export interface ResourceMaintenance {
  /**
   * The unique identifier of the maintenance
   * @example 1
   */
  id: number;
  /**
   * When the maintenance was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the maintenance was last updated
   * @format date-time
   */
  updatedAt: string;
  /**
   * The ID of the resource
   * @example 1
   */
  resourceId: number;
  /**
   * When the maintenance started
   * @format date-time
   * @example "2025-01-01T00:00:00.000Z"
   */
  startTime: string;
  /**
   * When the maintenance ended (null if not ended yet)
   * @format date-time
   * @example "2025-01-01T00:00:00.000Z"
   */
  endTime?: string | null;
  /** The reason for the maintenance */
  reason?: string;
}

export interface PaginatedMaintenanceResponse {
  total: number;
  page: number;
  limit: number;
  /** List of maintenances */
  data: ResourceMaintenance[];
}

export interface UpdateMaintenanceDto {
  /**
   * When the maintenance starts (must be in the future)
   * @format date-time
   * @example "2025-01-01T10:00:00.000Z"
   */
  startTime?: string;
  /**
   * When the maintenance ends (optional)
   * @format date-time
   * @example "2025-01-01T18:00:00.000Z"
   */
  endTime?: string | null;
  /**
   * The reason for the maintenance
   * @example "Scheduled maintenance for software updates"
   */
  reason?: string;
}

export interface ResourceFlowNodeSchemaDto {
  /** The name of the node type */
  type:
    | "input.button"
    | "input.resource.usage.started"
    | "input.resource.usage.stopped"
    | "input.resource.usage.takeover"
    | "input.resource.door.unlocked"
    | "input.resource.door.locked"
    | "input.resource.door.unlatched"
    | "output.http.sendRequest"
    | "output.mqtt.sendMessage"
    | "processing.wait"
    | "processing.if";
  /** The schema for a node type */
  configSchema: Record<string, any>;
  /** The inputs for a node type */
  inputs: string[];
  /** The outputs for a node type */
  outputs: string[];
  /** Whether the node type is supported by this resource */
  supportedByResource: boolean;
  /** Whether the node type is an output node */
  isOutput: boolean;
}

export interface ResourceFlowNodePositionDto {
  /**
   * The x position of the node
   * @example 100
   */
  x: number;
  /**
   * The y position of the node
   * @example 200
   */
  y: number;
}

export interface ResourceFlowNodeDto {
  /**
   * The unique identifier of the resource flow node
   * @example "TGVgqDzCKXKVr-XGUD5V3"
   */
  id: string;
  /**
   * The type of the node
   * @example "input.resource.usage.started"
   */
  type:
    | "input.button"
    | "input.resource.usage.started"
    | "input.resource.usage.stopped"
    | "input.resource.usage.takeover"
    | "input.resource.door.unlocked"
    | "input.resource.door.locked"
    | "input.resource.door.unlatched"
    | "output.http.sendRequest"
    | "output.mqtt.sendMessage"
    | "processing.wait"
    | "processing.if";
  /**
   * The position of the node
   * @example {"x":100,"y":200}
   */
  position: ResourceFlowNodePositionDto;
  /**
   * The data of the node, depending on the type of the node
   * @example {"url":"https://example.com/webhook","method":"POST","headers":{"Content-Type":"application/json"},"body":"{\"message\": \"Resource usage started\"}"}
   */
  data: Record<string, any>;
}

export interface ResourceFlowEdgeDto {
  /**
   * The unique identifier of the resource flow edge
   * @example "edge-abc123"
   */
  id: string;
  /**
   * The source node id
   * @example "TGVgqDzCKXKVr-XGUD5V3"
   */
  source: string;
  /**
   * The source handle id
   * @example "output"
   */
  sourceHandle?: string | null;
  /**
   * The target node id
   * @example "TGVgqDzCKXKVr-XGUD5V4"
   */
  target: string;
  /**
   * The target handle id
   * @example "input"
   */
  targetHandle?: string | null;
}

export interface ValidationErrorDto {
  /**
   * The ID of the node that has the validation error
   * @example "node-123"
   */
  nodeId: string;
  /**
   * The type of the node that has the validation error
   * @example "action.http.sendRequest"
   */
  nodeType: string;
  /**
   * The field that has the validation error
   * @example "url"
   */
  field: string;
  /**
   * The validation error message
   * @example "Invalid URL format"
   */
  message: string;
  /**
   * The invalid value that caused the error
   * @example "invalid-url"
   */
  value?: object;
}

export interface ResourceFlowResponseDto {
  /**
   * Array of flow nodes defining the workflow steps
   * @example [{"id":"TGVgqDzCKXKVr-XGUD5V3","type":"input.resource.usage.started","position":{"x":100,"y":200},"data":{}},{"id":"TGVgqDzCKXKVr-XGUD5V4","type":"output.http.sendRequest","position":{"x":300,"y":200},"data":{"url":"https://example.com/webhook","method":"POST","headers":{"Content-Type":"application/json"},"body":"{\"message\": \"Resource usage started\"}"}}]
   */
  nodes: ResourceFlowNodeDto[];
  /**
   * Array of flow edges connecting nodes to define the workflow flow
   * @example [{"id":"edge-abc123","source":"TGVgqDzCKXKVr-XGUD5V3","target":"TGVgqDzCKXKVr-XGUD5V4"}]
   */
  edges: ResourceFlowEdgeDto[];
  /**
   * Validation errors for nodes, if any
   * @example [{"nodeId":"TGVgqDzCKXKVr-XGUD5V4","nodeType":"action.http.sendRequest","field":"url","message":"Invalid URL format","value":"not-a-valid-url"}]
   */
  validationErrors?: ValidationErrorDto[];
}

export interface ResourceFlowSaveDto {
  /**
   * Array of flow nodes defining the workflow steps
   * @example [{"id":"TGVgqDzCKXKVr-XGUD5V3","type":"input.resource.usage.started","position":{"x":100,"y":200},"data":{}},{"id":"TGVgqDzCKXKVr-XGUD5V4","type":"output.http.sendRequest","position":{"x":300,"y":200},"data":{"url":"https://example.com/webhook","method":"POST","headers":{"Content-Type":"application/json"},"body":"{\"message\": \"Resource usage started\"}"}}]
   */
  nodes: ResourceFlowNodeDto[];
  /**
   * Array of flow edges connecting nodes to define the workflow flow
   * @example [{"id":"edge-abc123","source":"TGVgqDzCKXKVr-XGUD5V3","target":"TGVgqDzCKXKVr-XGUD5V4"}]
   */
  edges: ResourceFlowEdgeDto[];
}

export interface ResourceFlowLog {
  /**
   * The unique identifier of the resource flow log
   * @example 42
   */
  id: number;
  /**
   * The node id of the node that generated the log
   * @example "TGVgqDzCKXKVr-XGUD5V3"
   */
  nodeId: string | null;
  /**
   * The run/execution id of the flow that generated the log
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  flowRunId: string;
  /**
   * The type of the log entry
   * @example "node.processing.started"
   */
  type:
    | "flow.start"
    | "node.processing.started"
    | "node.processing.failed"
    | "node.processing.completed"
    | "flow.completed";
  /**
   * Optional payload for additional user information
   * @example "Processing took longer than expected due to network latency"
   */
  payload?: string;
  /**
   * When the node was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The id of the resource that this log belongs to
   * @example 1
   */
  resourceId: number;
  /** The resource being this log belongs to */
  resource?: Resource;
}

export interface ResourceFlowLogsResponseDto {
  total: number;
  page: number;
  limit: number;
  /** Array of flow log entries, ordered by creation time (newest first) */
  data: ResourceFlowLog[];
}

export interface ResourceFlowNodePosition {
  /**
   * The x position of the node
   * @example 100
   */
  x: number;
  /**
   * The y position of the node
   * @example 100
   */
  y: number;
}

export interface ResourceFlowNode {
  /**
   * The unique identifier of the resource flow node
   * @example "TGVgqDzCKXKVr-XGUD5V3"
   */
  id: string;
  /**
   * The type of the node
   * @example "input.resource.usage.started"
   */
  type: string;
  /**
   * The position of the node
   * @example {"x":100,"y":100}
   */
  position: ResourceFlowNodePosition;
  /**
   * The data of the node, depending on the type of the node
   * @example {"url":"https://example.com","method":"GET"}
   */
  data: object;
  /**
   * When the node was created
   * @format date-time
   */
  createdAt?: string;
  /**
   * When the node was last updated
   * @format date-time
   */
  updatedAt?: string;
  /**
   * The id of the resource that this node belongs to
   * @example 1
   */
  resourceId: number;
  /** The resource being this node belongs to */
  resource?: Resource;
}

export interface PluginMainFrontend {
  /**
   * The directory of the plugins frontend files
   * @example "frontend"
   */
  directory: string;
  /**
   * The entry point of the plugin, relative to the frontend directory
   * @example "index.mjs"
   */
  entryPoint: string;
}

export interface PluginMainBackend {
  /**
   * The directory of the plugins backend files
   * @example "backend"
   */
  directory: string;
  /**
   * The entry point of the plugin, relative to the backend directory
   * @example "index.mjs"
   */
  entryPoint: string;
}

export interface PluginMain {
  /**
   * The frontend files of the plugin
   * @example {"directory":"frontend","entryPoint":"index.mjs"}
   */
  frontend: PluginMainFrontend;
  /**
   * The backend file of the plugin
   * @example {"directory":"backend","entryPoint":"src/plugin.js"}
   */
  backend: PluginMainBackend;
}

export interface PluginAttraccessVersion {
  /**
   * The minimum version of the plugin
   * @example "1.0.0"
   */
  min: string;
  /**
   * The maximum version of the plugin
   * @example "1.0.0"
   */
  max: string;
  /**
   * The exact version of the plugin
   * @example "1.0.0"
   */
  exact: string;
}

export interface LoadedPluginManifest {
  /**
   * The name of the plugin
   * @example "plugin-name"
   */
  name: string;
  main: PluginMain;
  /**
   * The version of the plugin
   * @example "1.0.0"
   */
  version: string;
  attraccessVersion: PluginAttraccessVersion;
  /**
   * The directory of the plugin
   * @example "plugin-name"
   */
  pluginDirectory: string;
  /**
   * The id of the plugin
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  id: string;
}

export interface UploadPluginDto {
  /**
   * Plugin zip file
   * @format binary
   */
  pluginZip: File;
}

export interface EnrollNfcCardDto {
  /**
   * The ID of the reader to enroll the NFC card on
   * @example 1
   */
  readerId: number;
}

export interface EnrollNfcCardResponseDto {
  /**
   * Success message
   * @example "Enrollment initiated, continue on Reader"
   */
  message: string;
}

export interface ResetNfcCardDto {
  /**
   * The ID of the reader to reset the NFC card on
   * @example 1
   */
  readerId: number;
  /**
   * The ID of the NFC card to reset
   * @example 123
   */
  cardId: number;
}

export interface ResetNfcCardResponseDto {
  /**
   * Success message
   * @example "Reset initiated, continue on Reader"
   */
  message: string;
}

export interface UpdateReaderDto {
  /**
   * The name of the reader
   * @example "Main Entrance Reader"
   */
  name: string;
  /** The IDs of the resources that the reader has access to */
  connectedResourceIds: number[];
}

export type AttractapFirmwareVersion = object;

export interface Attractap {
  /** The ID of the reader */
  id: number;
  /** The name of the reader */
  name: string;
  /** The resources that the reader has access to */
  resources: Resource[];
  /**
   * The last time the reader connected to the server
   * @format date-time
   */
  lastConnection: string;
  /**
   * The first time the reader connected to the server
   * @format date-time
   */
  firstConnection: string;
  /** The firmware of the reader */
  firmware: AttractapFirmwareVersion;
}

export interface UpdateReaderResponseDto {
  /**
   * Success message
   * @example "Reader updated successfully"
   */
  message: string;
  /** The updated reader */
  reader: Attractap;
}

export interface AppKeyRequestDto {
  /**
   * The UID of the card to get the app key for
   * @example "04A2B3C4D5E6"
   */
  cardUID: string;
  /**
   * The key number to generate
   * @example 1
   */
  keyNo: number;
}

export interface AppKeyResponseDto {
  /**
   * Generated key in hex format
   * @example "0A1B2C3D4E5F6789"
   */
  key: string;
}

export interface NFCCard {
  /** The ID of the NFC card */
  id: number;
  /** The UID of the NFC card */
  uid: string;
  /** The ID of the user that owns the NFC card */
  user: User;
  /**
   * The date and time the NFC card was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time the NFC card was last updated
   * @format date-time
   */
  updatedAt: string;
  /**
   * The date and time the NFC card was last seen
   * @format date-time
   */
  lastSeen: string;
  /** Whether the NFC card is active */
  isActive: boolean;
}

export type NfcCardSetActiveStateDto = object;

export interface AttractapFirmware {
  /**
   * The name of the firmware
   * @example "attractap"
   */
  name: string;
  /**
   * The friendly name of the firmware
   * @example "Attractap (Ethernet)"
   */
  friendlyName: string;
  /**
   * The variant of the firmware
   * @example "eth"
   */
  variant: string;
  /**
   * The variant of the firmware
   * @example "eth"
   */
  variantFriendlyName: string;
  /**
   * The version of the firmware
   * @example "1.0.0"
   */
  version: string;
  /**
   * The board family of the firmware
   * @example "ESP32_C3"
   */
  boardFamily: string;
  /**
   * The filename of the firmware
   * @example "attractap_eth.bin"
   */
  filename: string;
  /**
   * The filename of the firmware for OTA updates (zlib compressed)
   * @example "attractap_eth.bin.zz"
   */
  filenameOTA: string;
}

export interface BalanceDto {
  /** The balance of the user */
  value: number;
}

export interface BillingTransaction {
  /**
   * The unique identifier of the billing transaction
   * @example 1
   */
  id: number;
  /**
   * The ID of the user
   * @example 1
   */
  userId: number;
  /** The user who the billing transaction belongs to */
  user: User;
  /**
   * The date and time the billing transaction was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time the billing transaction was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The credit amount of the billing transaction (negative for refunds/top-ups) */
  amount: number;
  /** The user ID of the user who caused the billing transaction */
  initiatorId: number;
  /** The user who initiated the billing transaction */
  initiator: User;
  /** The resource usage ID of the resource usage that caused the billing transaction */
  resourceUsageId: number;
  /** The resource usage that caused the billing transaction */
  resourceUsage: ResourceUsage;
  /** The billing transaction ID of the billing transaction that is being refunded */
  refundOfId: number;
  /** The billing transaction that is being refunded */
  refundOf: BillingTransaction;
}

export interface TransactionsDto {
  data: BillingTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface ModifyBalanceDto {
  /**
   * The amount to modify the balance by
   * @example 100
   */
  amount: number;
}

export interface ResourceBillingConfiguration {
  /**
   * The unique identifier of the resource billing configuration
   * @example 1
   */
  id: number;
  /**
   * The date and time the billing transaction was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time the billing transaction was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The ID of the resource */
  resourceId: number;
  /** The resource */
  resource?: object;
  /** The credit cost per usage */
  creditsPerUsage: number;
  /** The credit cost per minute */
  creditsPerMinute: number;
}

export interface UpdateResourceBillingConfigurationDto {
  /**
   * The credit cost per usage
   * @example 100
   */
  creditsPerUsage?: number;
  /**
   * The credit cost per minute
   * @example 100
   */
  creditsPerMinute?: number;
}

export interface InfoData {
  /** @example "Attraccess API" */
  name?: string;
  /** @example "ok" */
  status?: string;
}

export type CreateOneUserData = User;

export interface FindManyParams {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Search query */
  search?: string;
  /** User IDs */
  ids?: number[];
}

export type FindManyData = PaginatedUsersResponseDto;

export interface VerifyEmailData {
  /** @example "Email verified successfully" */
  message?: string;
}

export type RequestPasswordResetData = any;

export type ChangePasswordViaResetTokenData = any;

export type GetCurrentData = User;

export type ChangeMyUsernameData = User;

export type GetOneUserByIdData = User;

export type GetOneUserByIdError = UserNotFoundException;

export type UpdatePermissionsData = User;

export interface GetPermissionsData {
  canManageResources?: boolean;
  canManageSystemConfiguration?: boolean;
  canManageUsers?: boolean;
}

export type BulkUpdatePermissionsData = User[];

export interface GetAllWithPermissionParams {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Filter users by permission */
  permission?:
    | "canManageResources"
    | "canManageSystemConfiguration"
    | "canManageUsers";
}

export type GetAllWithPermissionData = PaginatedUsersResponseDto;

export interface SetUserPasswordData {
  /** @example "Password updated successfully" */
  message?: string;
}

export type ChangeUserUsernameData = User;

export interface CreateSessionPayload {
  username?: string;
  password?: string;
  tokenLocation?: "cookie" | "body";
}

export type CreateSessionData = CreateSessionResponse;

export interface RefreshSessionParams {
  tokenLocation: string;
}

export type RefreshSessionData = CreateSessionResponse;

export type EndSessionData = object;

export type GetAllSsoProvidersData = SSOProvider[];

export type CreateOneSsoProviderData = SSOProvider;

export interface LinkUserToExternalAccountData {
  /** Whether the account has been linked to the external identifier */
  OK?: boolean;
}

export type GetOneSsoProviderByIdData = SSOProvider;

export type UpdateOneSsoProviderData = SSOProvider;

export type DeleteOneSsoProviderData = any;

export interface DiscoverAuthentikOidcParams {
  /** Authentik host, e.g. http://localhost:9000 */
  host: string;
  /** Authentik application slug */
  applicationName: string;
}

export type DiscoverAuthentikOidcData = any;

export interface DiscoverKeycloakOidcParams {
  /** Keycloak host, e.g. http://localhost:8080 */
  host: string;
  /** Keycloak realm name */
  realm: string;
}

export type DiscoverKeycloakOidcData = any;

export interface LoginWithOidcParams {
  /** The URL to redirect to after login (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication */
  redirectTo?: any;
  /** The ID of the SSO provider */
  providerId: string;
}

export type LoginWithOidcData = any;

export interface OidcLoginCallbackParams {
  redirectTo: string;
  code: any;
  iss: any;
  "session-state": any;
  state: any;
  /** The ID of the SSO provider */
  providerId: string;
}

export type OidcLoginCallbackData = CreateSessionResponse;

export type EmailTemplateControllerPreviewMjmlData = PreviewMjmlResponseDto;

export type EmailTemplateControllerFindAllData = EmailTemplate[];

export type EmailTemplateControllerFindOneData = EmailTemplate;

export type EmailTemplateControllerUpdateData = EmailTemplate;

export type GetLicenseInformationData = LicenseDataDto;

export type CreateOneResourceData = Resource;

export interface GetAllResourcesParams {
  /**
   * Page number (1-based)
   * @min 1
   * @default 1
   */
  page?: number;
  /**
   * Number of items per page
   * @min 1
   * @default 10
   */
  limit?: number;
  /** Search term to filter resources */
  search?: string;
  /** Group ID to filter resources. Send -1 to find ungrouped resources. */
  groupId?: number;
  /** Resource IDs to filter resources */
  ids?: number[];
  /** Only resources in use by me */
  onlyInUseByMe?: boolean;
  /** Only resources with permissions */
  onlyWithPermissions?: boolean;
}

export type GetAllResourcesData = PaginatedResourceResponseDto;

export type GetAllResourcesInUseData = Resource[];

export type GetOneResourceByIdData = Resource;

export type UpdateOneResourceData = Resource;

export type DeleteOneResourceData = any;

export type MqttServersGetAllData = MqttServer[];

export type MqttServersCreateOneData = MqttServer;

export type MqttServersGetOneByIdData = MqttServer;

export type MqttServersUpdateOneData = MqttServer;

export type MqttServersDeleteOneData = any;

export type MqttServersTestConnectionData = TestConnectionResponseDto;

export type MqttServersGetStatusOfOneData = MqttServerStatusDto;

export type MqttServersGetStatusOfAllData = AllMqttServerStatusesDto;

export type SseControllerStreamEventsData = any;

export type ResourceGroupsCreateOneData = ResourceGroup;

export type ResourceGroupsGetManyData = ResourceGroup[];

export type ResourceGroupsGetOneData = ResourceGroup;

export type ResourceGroupsUpdateOneData = ResourceGroup;

export type ResourceGroupsAddResourceData = any;

export type ResourceGroupsRemoveResourceData = any;

export type ResourceGroupsDeleteOneData = any;

export type ResourceGroupIntroductionsGetManyData = ResourceIntroduction[];

export type ResourceGroupIntroductionsGetHistoryData =
  ResourceIntroductionHistoryItem[];

export type ResourceGroupIntroductionsGrantData =
  ResourceIntroductionHistoryItem;

export type ResourceGroupIntroductionsRevokeData =
  ResourceIntroductionHistoryItem;

export type ResourceGroupIntroducersGetManyData = ResourceIntroducer[];

export type ResourceGroupIntroducersIsIntroducerData =
  IsResourceGroupIntroducerResponseDto;

export type ResourceGroupIntroducersGrantData = any;

export type ResourceGroupIntroducersRevokeData = any;

export type ResourceUsageStartSessionData = ResourceUsage;

export type ResourceUsageEndSessionData = ResourceUsage;

export type LockDoorData = ResourceUsage;

export type UnlockDoorData = ResourceUsage;

export type UnlatchDoorData = ResourceUsage;

export interface ResourceUsageGetHistoryParams {
  /**
   * The page number to retrieve
   * @example 1
   */
  page?: number;
  /**
   * The number of items per page
   * @example 10
   */
  limit?: number;
  /**
   * The user ID to filter by
   * @example 1
   */
  userId?: number;
  resourceId: number;
}

export type ResourceUsageGetHistoryData = GetResourceHistoryResponseDto;

export type ResourceUsageGetActiveSessionData = GetActiveUsageSessionDto;

export type ResourceUsageCanControlData = CanControlResponseDto;

export interface ResourceIntroducersIsIntroducerParams {
  includeGroups: boolean;
  resourceId: number;
  userId: number;
}

export type ResourceIntroducersIsIntroducerData =
  IsResourceIntroducerResponseDto;

export type ResourceIntroducersGetManyData = ResourceIntroducer[];

export type ResourceIntroducersGrantData = ResourceIntroducer;

export type ResourceIntroducersRevokeData = any;

export type ResourceIntroductionsGetManyData = ResourceIntroduction[];

export type ResourceIntroductionsGrantData = ResourceIntroductionHistoryItem;

export type ResourceIntroductionsRevokeData = ResourceIntroductionHistoryItem;

export type ResourceIntroductionsGetHistoryData =
  ResourceIntroductionHistoryItem[];

export type CanManageMaintenanceData = CanManageMaintenanceResponseDto;

export type CreateMaintenanceData = ResourceMaintenance;

export interface FindMaintenancesParams {
  /**
   * Page number for pagination
   * @default 1
   * @example 1
   */
  page?: number;
  /**
   * Number of items per page
   * @default 10
   * @example 10
   */
  limit?: number;
  /**
   * Include upcoming maintenances (start time in the future)
   * @default true
   * @example true
   */
  includeUpcoming?: boolean;
  /**
   * Include active maintenances (currently ongoing)
   * @default true
   * @example true
   */
  includeActive?: boolean;
  /**
   * Include past maintenances (already finished)
   * @default false
   * @example false
   */
  includePast?: boolean;
  /** The ID of the resource */
  resourceId: number;
}

export type FindMaintenancesData = PaginatedMaintenanceResponse;

export type GetMaintenanceData = ResourceMaintenance;

export type UpdateMaintenanceData = ResourceMaintenance;

export type CancelMaintenanceData = any;

export type GetNodeSchemasData = ResourceFlowNodeSchemaDto[];

export type GetResourceFlowData = ResourceFlowResponseDto;

export type GetResourceFlowError = {
  /** @example "Resource not found" */
  message?: string;
  /** @example 404 */
  statusCode?: number;
};

export type SaveResourceFlowData = ResourceFlowResponseDto;

export type SaveResourceFlowError =
  | {
      /** @example ["nodes must be an array"] */
      message?: string[];
      /** @example 400 */
      statusCode?: number;
    }
  | {
      /** @example "Resource not found" */
      message?: string;
      /** @example 404 */
      statusCode?: number;
    };

export interface GetResourceFlowLogsParams {
  /**
   * Page number (1-based)
   * @min 1
   * @default 1
   */
  page?: number;
  /**
   * Number of items per page
   * @min 1
   * @max 500
   * @default 50
   */
  limit?: number;
  /**
   * The ID of the resource to get the flow logs for
   * @example 1
   */
  resourceId: number;
}

export type GetResourceFlowLogsData = ResourceFlowLogsResponseDto;

export type GetResourceFlowLogsError = {
  /** @example "Resource not found" */
  message?: string;
  /** @example 404 */
  statusCode?: number;
};

export type ResourceFlowsControllerStreamEventsData = any;

export interface PressButtonData {
  /** @example "OK" */
  message?: string;
}

export type GetButtonsData = ResourceFlowNode[];

export type GetPluginsData = LoadedPluginManifest[];

export type GetFrontendPluginFileData = string;

export type DeletePluginData = any;

export type EnrollNfcCardData = EnrollNfcCardResponseDto;

export type ResetNfcCardData = ResetNfcCardResponseDto;

export type UpdateReaderData = UpdateReaderResponseDto;

export type GetReaderByIdData = Attractap;

export type DeleteReaderData = any;

export type GetReadersData = Attractap[];

export type GetAppKeyByUidData = AppKeyResponseDto;

export type GetAllCardsData = NFCCard[];

export type ToggleCardActiveData = NFCCard;

export type GetFirmwaresData = AttractapFirmware[];

export type GetFirmwareBinaryData = string;

export interface AnalyticsControllerGetResourceUsageHoursInDateRangeParams {
  /**
   * The start date of the range
   * @format date-time
   * @example "2021-01-01"
   */
  start: string;
  /**
   * The end date of the range
   * @format date-time
   * @example "2021-01-01"
   */
  end: string;
}

export type AnalyticsControllerGetResourceUsageHoursInDateRangeData =
  ResourceUsage[];

export type GetBillingBalanceData = BalanceDto;

export interface GetBillingTransactionsParams {
  /**
   * The page number to retrieve
   * @example 1
   */
  page?: number;
  /**
   * The number of items per page
   * @example 10
   */
  limit?: number;
  userId: number;
}

export type GetBillingTransactionsData = TransactionsDto;

export type CreateManualTransactionData = number;

export type GetBillingConfigurationData = ResourceBillingConfiguration;

export type UpdateBillingConfigurationData = ResourceBillingConfiguration;

export namespace System {
  /**
   * No description
   * @tags System
   * @name Info
   * @summary Return API information
   * @request GET:/api/info
   */
  export namespace Info {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = InfoData;
  }
}

export namespace Users {
  /**
   * No description
   * @tags Users
   * @name CreateOneUser
   * @summary Create a new user
   * @request POST:/api/users
   */
  export namespace CreateOneUser {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateUserDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateOneUserData;
  }

  /**
   * No description
   * @tags Users
   * @name FindMany
   * @summary Get a paginated list of users
   * @request GET:/api/users
   * @secure
   */
  export namespace FindMany {
    export type RequestParams = {};
    export type RequestQuery = {
      /** Page number (1-based) */
      page?: number;
      /** Number of items per page */
      limit?: number;
      /** Search query */
      search?: string;
      /** User IDs */
      ids?: number[];
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = FindManyData;
  }

  /**
   * No description
   * @tags Users
   * @name VerifyEmail
   * @summary Verify a user email address
   * @request POST:/api/users/verify-email
   */
  export namespace VerifyEmail {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = VerifyEmailDto;
    export type RequestHeaders = {};
    export type ResponseBody = VerifyEmailData;
  }

  /**
   * No description
   * @tags Users
   * @name RequestPasswordReset
   * @summary Request a password reset
   * @request POST:/api/users/reset-password
   */
  export namespace RequestPasswordReset {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = ResetPasswordDto;
    export type RequestHeaders = {};
    export type ResponseBody = RequestPasswordResetData;
  }

  /**
   * No description
   * @tags Users
   * @name ChangePasswordViaResetToken
   * @summary Change a user password after password reset
   * @request POST:/api/users/{userId}/change-password-by-token
   */
  export namespace ChangePasswordViaResetToken {
    export type RequestParams = {
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = ChangePasswordDto;
    export type RequestHeaders = {};
    export type ResponseBody = ChangePasswordViaResetTokenData;
  }

  /**
   * No description
   * @tags Users
   * @name GetCurrent
   * @summary Get the current authenticated user
   * @request GET:/api/users/me
   * @secure
   */
  export namespace GetCurrent {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetCurrentData;
  }

  /**
   * No description
   * @tags Users
   * @name ChangeMyUsername
   * @summary Change current user username (limit once per day)
   * @request PATCH:/api/users/me/username
   * @secure
   */
  export namespace ChangeMyUsername {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = ChangeUsernameDto;
    export type RequestHeaders = {};
    export type ResponseBody = ChangeMyUsernameData;
  }

  /**
   * No description
   * @tags Users
   * @name GetOneUserById
   * @summary Get a user by ID
   * @request GET:/api/users/{id}
   * @secure
   */
  export namespace GetOneUserById {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetOneUserByIdData;
  }

  /**
   * No description
   * @tags Users
   * @name UpdatePermissions
   * @summary Update a user's system permissions
   * @request PATCH:/api/users/{id}/permissions
   * @secure
   */
  export namespace UpdatePermissions {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateUserPermissionsDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdatePermissionsData;
  }

  /**
   * No description
   * @tags Users
   * @name GetPermissions
   * @summary Get a user's system permissions
   * @request GET:/api/users/{id}/permissions
   * @secure
   */
  export namespace GetPermissions {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetPermissionsData;
  }

  /**
   * No description
   * @tags Users
   * @name BulkUpdatePermissions
   * @summary Bulk update user permissions
   * @request POST:/api/users/permissions
   * @secure
   */
  export namespace BulkUpdatePermissions {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = BulkUpdateUserPermissionsDto;
    export type RequestHeaders = {};
    export type ResponseBody = BulkUpdatePermissionsData;
  }

  /**
   * No description
   * @tags Users
   * @name GetAllWithPermission
   * @summary Get users with a specific permission
   * @request GET:/api/users/with-permission
   * @secure
   */
  export namespace GetAllWithPermission {
    export type RequestParams = {};
    export type RequestQuery = {
      /** Page number (1-based) */
      page?: number;
      /** Number of items per page */
      limit?: number;
      /** Filter users by permission */
      permission?:
        | "canManageResources"
        | "canManageSystemConfiguration"
        | "canManageUsers";
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetAllWithPermissionData;
  }

  /**
   * No description
   * @tags Users
   * @name SetUserPassword
   * @summary Set a user's password directly
   * @request POST:/api/users/{id}/password
   * @secure
   */
  export namespace SetUserPassword {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = SetUserPasswordDto;
    export type RequestHeaders = {};
    export type ResponseBody = SetUserPasswordData;
  }

  /**
   * No description
   * @tags Users
   * @name ChangeUserUsername
   * @summary Admin: Change a user's username (no limit)
   * @request PATCH:/api/users/{id}/username
   * @secure
   */
  export namespace ChangeUserUsername {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = ChangeUsernameDto;
    export type RequestHeaders = {};
    export type ResponseBody = ChangeUserUsernameData;
  }
}

export namespace Authentication {
  /**
   * No description
   * @tags Authentication
   * @name CreateSession
   * @summary Create a new session using local authentication
   * @request POST:/api/auth/session/local
   */
  export namespace CreateSession {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateSessionPayload;
    export type RequestHeaders = {};
    export type ResponseBody = CreateSessionData;
  }

  /**
   * No description
   * @tags Authentication
   * @name RefreshSession
   * @summary Refresh the current session
   * @request GET:/api/auth/session/refresh
   * @secure
   */
  export namespace RefreshSession {
    export type RequestParams = {};
    export type RequestQuery = {
      tokenLocation: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = RefreshSessionData;
  }

  /**
   * No description
   * @tags Authentication
   * @name EndSession
   * @summary Logout and invalidate the current session
   * @request DELETE:/api/auth/session
   * @secure
   */
  export namespace EndSession {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = EndSessionData;
  }

  /**
   * No description
   * @tags Authentication
   * @name GetAllSsoProviders
   * @summary Get all SSO providers
   * @request GET:/api/auth/sso/providers
   */
  export namespace GetAllSsoProviders {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetAllSsoProvidersData;
  }

  /**
   * No description
   * @tags Authentication
   * @name CreateOneSsoProvider
   * @summary Create a new SSO provider
   * @request POST:/api/auth/sso/providers
   * @secure
   */
  export namespace CreateOneSsoProvider {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateSSOProviderDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateOneSsoProviderData;
  }

  /**
   * No description
   * @tags Authentication
   * @name LinkUserToExternalAccount
   * @summary Link an account to an external identifier
   * @request POST:/api/auth/sso/link-account
   */
  export namespace LinkUserToExternalAccount {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = LinkUserToExternalAccountRequestDto;
    export type RequestHeaders = {};
    export type ResponseBody = LinkUserToExternalAccountData;
  }

  /**
   * No description
   * @tags Authentication
   * @name GetOneSsoProviderById
   * @summary Get SSO provider by ID with full configuration
   * @request GET:/api/auth/sso/providers/{id}
   * @secure
   */
  export namespace GetOneSsoProviderById {
    export type RequestParams = {
      /** The ID of the SSO provider */
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetOneSsoProviderByIdData;
  }

  /**
   * No description
   * @tags Authentication
   * @name UpdateOneSsoProvider
   * @summary Update an existing SSO provider
   * @request PUT:/api/auth/sso/providers/{id}
   * @secure
   */
  export namespace UpdateOneSsoProvider {
    export type RequestParams = {
      /** The ID of the SSO provider */
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateSSOProviderDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateOneSsoProviderData;
  }

  /**
   * No description
   * @tags Authentication
   * @name DeleteOneSsoProvider
   * @summary Delete an SSO provider
   * @request DELETE:/api/auth/sso/providers/{id}
   * @secure
   */
  export namespace DeleteOneSsoProvider {
    export type RequestParams = {
      /** The ID of the SSO provider */
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeleteOneSsoProviderData;
  }

  /**
   * No description
   * @tags Authentication
   * @name DiscoverAuthentikOidc
   * @summary Proxy Authentik OIDC well-known discovery
   * @request GET:/api/auth/sso/discovery/authentik
   * @secure
   */
  export namespace DiscoverAuthentikOidc {
    export type RequestParams = {};
    export type RequestQuery = {
      /** Authentik host, e.g. http://localhost:9000 */
      host: string;
      /** Authentik application slug */
      applicationName: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DiscoverAuthentikOidcData;
  }

  /**
   * No description
   * @tags Authentication
   * @name DiscoverKeycloakOidc
   * @summary Proxy Keycloak OIDC well-known discovery
   * @request GET:/api/auth/sso/discovery/keycloak
   * @secure
   */
  export namespace DiscoverKeycloakOidc {
    export type RequestParams = {};
    export type RequestQuery = {
      /** Keycloak host, e.g. http://localhost:8080 */
      host: string;
      /** Keycloak realm name */
      realm: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DiscoverKeycloakOidcData;
  }

  /**
   * @description Login with OIDC and redirect to the callback URL (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
   * @tags Authentication
   * @name LoginWithOidc
   * @summary Login with OIDC
   * @request GET:/api/auth/sso/OIDC/{providerId}/login
   */
  export namespace LoginWithOidc {
    export type RequestParams = {
      /** The ID of the SSO provider */
      providerId: string;
    };
    export type RequestQuery = {
      /** The URL to redirect to after login (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication */
      redirectTo?: any;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = LoginWithOidcData;
  }

  /**
   * No description
   * @tags Authentication
   * @name OidcLoginCallback
   * @summary Callback for OIDC login
   * @request GET:/api/auth/sso/OIDC/{providerId}/callback
   */
  export namespace OidcLoginCallback {
    export type RequestParams = {
      /** The ID of the SSO provider */
      providerId: string;
    };
    export type RequestQuery = {
      redirectTo: string;
      code: any;
      iss: any;
      "session-state": any;
      state: any;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = OidcLoginCallbackData;
  }
}

export namespace EmailTemplates {
  /**
   * No description
   * @tags Email Templates
   * @name EmailTemplateControllerPreviewMjml
   * @summary Preview MJML content as HTML
   * @request POST:/api/email-templates/preview-mjml
   * @secure
   */
  export namespace EmailTemplateControllerPreviewMjml {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = PreviewMjmlDto;
    export type RequestHeaders = {};
    export type ResponseBody = EmailTemplateControllerPreviewMjmlData;
  }

  /**
   * No description
   * @tags Email Templates
   * @name EmailTemplateControllerFindAll
   * @summary List all email templates
   * @request GET:/api/email-templates
   * @secure
   */
  export namespace EmailTemplateControllerFindAll {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = EmailTemplateControllerFindAllData;
  }

  /**
   * No description
   * @tags Email Templates
   * @name EmailTemplateControllerFindOne
   * @summary Get an email template by type
   * @request GET:/api/email-templates/{type}
   * @secure
   */
  export namespace EmailTemplateControllerFindOne {
    export type RequestParams = {
      /** Template type/type */
      type:
        | "verify-email"
        | "reset-password"
        | "username-changed"
        | "password-changed";
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = EmailTemplateControllerFindOneData;
  }

  /**
   * No description
   * @tags Email Templates
   * @name EmailTemplateControllerUpdate
   * @summary Update an email template
   * @request PATCH:/api/email-templates/{type}
   * @secure
   */
  export namespace EmailTemplateControllerUpdate {
    export type RequestParams = {
      /** Template type/type */
      type:
        | "verify-email"
        | "reset-password"
        | "username-changed"
        | "password-changed";
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateEmailTemplateDto;
    export type RequestHeaders = {};
    export type ResponseBody = EmailTemplateControllerUpdateData;
  }
}

export namespace License {
  /**
   * No description
   * @tags License
   * @name GetLicenseInformation
   * @summary Get license information
   * @request GET:/api/license-data
   * @secure
   */
  export namespace GetLicenseInformation {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetLicenseInformationData;
  }
}

export namespace Resources {
  /**
   * No description
   * @tags Resources
   * @name CreateOneResource
   * @summary Create a new resource
   * @request POST:/api/resources
   * @secure
   */
  export namespace CreateOneResource {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateResourceDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateOneResourceData;
  }

  /**
   * No description
   * @tags Resources
   * @name GetAllResources
   * @summary Get all resources
   * @request GET:/api/resources
   * @secure
   */
  export namespace GetAllResources {
    export type RequestParams = {};
    export type RequestQuery = {
      /**
       * Page number (1-based)
       * @min 1
       * @default 1
       */
      page?: number;
      /**
       * Number of items per page
       * @min 1
       * @default 10
       */
      limit?: number;
      /** Search term to filter resources */
      search?: string;
      /** Group ID to filter resources. Send -1 to find ungrouped resources. */
      groupId?: number;
      /** Resource IDs to filter resources */
      ids?: number[];
      /** Only resources in use by me */
      onlyInUseByMe?: boolean;
      /** Only resources with permissions */
      onlyWithPermissions?: boolean;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetAllResourcesData;
  }

  /**
   * No description
   * @tags Resources
   * @name GetAllResourcesInUse
   * @summary Get all resources in use
   * @request GET:/api/resources/in-use
   */
  export namespace GetAllResourcesInUse {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetAllResourcesInUseData;
  }

  /**
   * No description
   * @tags Resources
   * @name GetOneResourceById
   * @summary Get a resource by ID
   * @request GET:/api/resources/{id}
   * @secure
   */
  export namespace GetOneResourceById {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetOneResourceByIdData;
  }

  /**
   * No description
   * @tags Resources
   * @name UpdateOneResource
   * @summary Update a resource
   * @request PUT:/api/resources/{id}
   * @secure
   */
  export namespace UpdateOneResource {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateOneResourceData;
  }

  /**
   * No description
   * @tags Resources
   * @name DeleteOneResource
   * @summary Delete a resource
   * @request DELETE:/api/resources/{id}
   * @secure
   */
  export namespace DeleteOneResource {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeleteOneResourceData;
  }

  /**
   * No description
   * @tags Resources
   * @name SseControllerStreamEvents
   * @request GET:/api/resources/{resourceId}/events
   */
  export namespace SseControllerStreamEvents {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = SseControllerStreamEventsData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsCreateOne
   * @summary Create a new resource group
   * @request POST:/api/resource-groups
   * @secure
   */
  export namespace ResourceGroupsCreateOne {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateResourceGroupDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsCreateOneData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsGetMany
   * @summary Get many resource groups
   * @request GET:/api/resource-groups
   */
  export namespace ResourceGroupsGetMany {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsGetManyData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsGetOne
   * @summary Get a resource group by ID
   * @request GET:/api/resource-groups/{id}
   */
  export namespace ResourceGroupsGetOne {
    export type RequestParams = {
      /** The ID of the resource group */
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsGetOneData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsUpdateOne
   * @summary Update a resource group by ID
   * @request PUT:/api/resource-groups/{id}
   * @secure
   */
  export namespace ResourceGroupsUpdateOne {
    export type RequestParams = {
      /** The ID of the resource group */
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceGroupDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsUpdateOneData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsAddResource
   * @summary Add a resource to a resource group
   * @request POST:/api/resource-groups/{groupId}/resources/{resourceId}
   * @secure
   */
  export namespace ResourceGroupsAddResource {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
      /** The ID of the resource */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsAddResourceData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsRemoveResource
   * @summary Remove a resource from a resource group
   * @request DELETE:/api/resource-groups/{groupId}/resources/{resourceId}
   * @secure
   */
  export namespace ResourceGroupsRemoveResource {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
      /** The ID of the resource */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsRemoveResourceData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceGroupsDeleteOne
   * @summary Delete a resource group by ID
   * @request DELETE:/api/resource-groups/{groupId}
   * @secure
   */
  export namespace ResourceGroupsDeleteOne {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupsDeleteOneData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceUsageStartSession
   * @summary Start a resource usage session
   * @request POST:/api/resources/{resourceId}/usage/start
   * @secure
   */
  export namespace ResourceUsageStartSession {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = StartUsageSessionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceUsageStartSessionData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceUsageEndSession
   * @summary End a resource usage session
   * @request PUT:/api/resources/{resourceId}/usage/end
   * @secure
   */
  export namespace ResourceUsageEndSession {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = EndUsageSessionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceUsageEndSessionData;
  }

  /**
   * No description
   * @tags Resources
   * @name LockDoor
   * @summary Lock a resource of door type
   * @request POST:/api/resources/{resourceId}/usage/lock
   * @secure
   */
  export namespace LockDoor {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = LockDoorData;
  }

  /**
   * No description
   * @tags Resources
   * @name UnlockDoor
   * @summary Unlock a resource of door type
   * @request POST:/api/resources/{resourceId}/usage/unlock
   * @secure
   */
  export namespace UnlockDoor {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = UnlockDoorData;
  }

  /**
   * No description
   * @tags Resources
   * @name UnlatchDoor
   * @summary Unlatch a resource of door type (if supported)
   * @request POST:/api/resources/{resourceId}/usage/unlatch
   * @secure
   */
  export namespace UnlatchDoor {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = UnlatchDoorData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceUsageGetHistory
   * @summary Get usage history for a resource
   * @request GET:/api/resources/{resourceId}/usage/history
   * @secure
   */
  export namespace ResourceUsageGetHistory {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {
      /**
       * The page number to retrieve
       * @example 1
       */
      page?: number;
      /**
       * The number of items per page
       * @example 10
       */
      limit?: number;
      /**
       * The user ID to filter by
       * @example 1
       */
      userId?: number;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceUsageGetHistoryData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceUsageGetActiveSession
   * @summary Get active usage session for current user
   * @request GET:/api/resources/{resourceId}/usage/active
   * @secure
   */
  export namespace ResourceUsageGetActiveSession {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceUsageGetActiveSessionData;
  }

  /**
   * No description
   * @tags Resources
   * @name ResourceUsageCanControl
   * @summary Check if the current user can control a resource
   * @request GET:/api/resources/{resourceId}/usage/can-control
   * @secure
   */
  export namespace ResourceUsageCanControl {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceUsageCanControlData;
  }
}

export namespace Mqtt {
  /**
   * No description
   * @tags MQTT
   * @name MqttServersGetAll
   * @summary Get all MQTT servers
   * @request GET:/api/mqtt/servers
   * @secure
   */
  export namespace MqttServersGetAll {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersGetAllData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersCreateOne
   * @summary Create new MQTT server
   * @request POST:/api/mqtt/servers
   * @secure
   */
  export namespace MqttServersCreateOne {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateMqttServerDto;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersCreateOneData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersGetOneById
   * @summary Get MQTT server by ID
   * @request GET:/api/mqtt/servers/{id}
   * @secure
   */
  export namespace MqttServersGetOneById {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersGetOneByIdData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersUpdateOne
   * @summary Update MQTT server
   * @request PUT:/api/mqtt/servers/{id}
   * @secure
   */
  export namespace MqttServersUpdateOne {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateMqttServerDto;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersUpdateOneData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersDeleteOne
   * @summary Delete MQTT server
   * @request DELETE:/api/mqtt/servers/{id}
   * @secure
   */
  export namespace MqttServersDeleteOne {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersDeleteOneData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersTestConnection
   * @summary Test MQTT server connection
   * @request POST:/api/mqtt/servers/{id}/test
   * @secure
   */
  export namespace MqttServersTestConnection {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersTestConnectionData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersGetStatusOfOne
   * @summary Get MQTT server connection status and statistics
   * @request GET:/api/mqtt/servers/{id}/status
   * @secure
   */
  export namespace MqttServersGetStatusOfOne {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersGetStatusOfOneData;
  }

  /**
   * No description
   * @tags MQTT
   * @name MqttServersGetStatusOfAll
   * @summary Get all MQTT server connection statuses and statistics
   * @request GET:/api/mqtt/servers/status
   * @secure
   */
  export namespace MqttServersGetStatusOfAll {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = MqttServersGetStatusOfAllData;
  }
}

export namespace AccessControl {
  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroductionsGetMany
   * @summary Get many introductions by group ID
   * @request GET:/api/resource-groups/{groupId}/introductions
   * @secure
   */
  export namespace ResourceGroupIntroductionsGetMany {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroductionsGetManyData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroductionsGetHistory
   * @summary Get history of introductions by group ID and user ID
   * @request GET:/api/resource-groups/{groupId}/introductions/{userId}/history
   * @secure
   */
  export namespace ResourceGroupIntroductionsGetHistory {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
      /** The ID of the user */
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroductionsGetHistoryData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroductionsGrant
   * @summary Grant introduction permission for a resource group to a user
   * @request POST:/api/resource-groups/{groupId}/introductions/{userId}/grant
   * @secure
   */
  export namespace ResourceGroupIntroductionsGrant {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
      /** The ID of the user */
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceGroupIntroductionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroductionsGrantData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroductionsRevoke
   * @summary Revoke introduction permission for a resource group from a user
   * @request POST:/api/resource-groups/{groupId}/introductions/{userId}/revoke
   * @secure
   */
  export namespace ResourceGroupIntroductionsRevoke {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
      /** The ID of the user */
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceGroupIntroductionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroductionsRevokeData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroducersGetMany
   * @summary Get all introducers for a resource group
   * @request GET:/api/resource-groups/{groupId}/introducers
   */
  export namespace ResourceGroupIntroducersGetMany {
    export type RequestParams = {
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroducersGetManyData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroducersIsIntroducer
   * @summary Check if a user is an introducer for a resource group
   * @request GET:/api/resource-groups/{groupId}/introducers/{userId}/is-introducer
   */
  export namespace ResourceGroupIntroducersIsIntroducer {
    export type RequestParams = {
      /** The ID of the user */
      userId: number;
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroducersIsIntroducerData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroducersGrant
   * @summary Grant a user introduction permission for a resource group
   * @request POST:/api/resource-groups/{groupId}/introducers/{userId}/grant
   * @secure
   */
  export namespace ResourceGroupIntroducersGrant {
    export type RequestParams = {
      /** The ID of the user */
      userId: number;
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroducersGrantData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceGroupIntroducersRevoke
   * @summary Revoke a user introduction permission for a resource group
   * @request POST:/api/resource-groups/{groupId}/introducers/{userId}/revoke
   * @secure
   */
  export namespace ResourceGroupIntroducersRevoke {
    export type RequestParams = {
      /** The ID of the user */
      userId: number;
      /** The ID of the resource group */
      groupId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceGroupIntroducersRevokeData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroducersIsIntroducer
   * @summary Check if a user is an introducer for a resource
   * @request GET:/api/resources/{resourceId}/introducers/{userId}/is-introducer
   */
  export namespace ResourceIntroducersIsIntroducer {
    export type RequestParams = {
      resourceId: number;
      userId: number;
    };
    export type RequestQuery = {
      includeGroups: boolean;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroducersIsIntroducerData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroducersGetMany
   * @summary Get all introducers for a resource
   * @request GET:/api/resources/{resourceId}/introducers
   */
  export namespace ResourceIntroducersGetMany {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroducersGetManyData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroducersGrant
   * @summary Grant a user introduction permission for a resource
   * @request POST:/api/resources/{resourceId}/introducers/{userId}/grant
   * @secure
   */
  export namespace ResourceIntroducersGrant {
    export type RequestParams = {
      resourceId: number;
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroducersGrantData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroducersRevoke
   * @summary Revoke a user introduction permission for a resource
   * @request DELETE:/api/resources/{resourceId}/introducers/{userId}/revoke
   * @secure
   */
  export namespace ResourceIntroducersRevoke {
    export type RequestParams = {
      resourceId: number;
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroducersRevokeData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroductionsGetMany
   * @summary Get all introductions for a resource
   * @request GET:/api/resources/{resourceId}/introductions
   */
  export namespace ResourceIntroductionsGetMany {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroductionsGetManyData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroductionsGrant
   * @summary Grant a user usage permission for a resource
   * @request POST:/api/resources/{resourceId}/introductions/{userId}/grant
   * @secure
   */
  export namespace ResourceIntroductionsGrant {
    export type RequestParams = {
      resourceId: number;
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceIntroductionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroductionsGrantData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroductionsRevoke
   * @summary Revoke a user usage permission for a resource
   * @request DELETE:/api/resources/{resourceId}/introductions/{userId}/revoke
   * @secure
   */
  export namespace ResourceIntroductionsRevoke {
    export type RequestParams = {
      resourceId: number;
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceIntroductionDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroductionsRevokeData;
  }

  /**
   * No description
   * @tags Access Control
   * @name ResourceIntroductionsGetHistory
   * @summary Get history of introductions by resource ID and user ID
   * @request GET:/api/resources/{resourceId}/introductions/{userId}/history
   * @secure
   */
  export namespace ResourceIntroductionsGetHistory {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
      /** The ID of the user */
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceIntroductionsGetHistoryData;
  }
}

export namespace ResourceMaintenances {
  /**
   * @description Check if the authenticated user has permission to manage maintenance for the specified resource
   * @tags Resource Maintenances
   * @name CanManageMaintenance
   * @summary Check if user can manage maintenance
   * @request GET:/api/resources/{resourceId}/maintenances/can-manage
   * @secure
   */
  export namespace CanManageMaintenance {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = CanManageMaintenanceData;
  }

  /**
   * @description Create a new maintenance schedule for a specific resource
   * @tags Resource Maintenances
   * @name CreateMaintenance
   * @summary Create a maintenance for a resource
   * @request POST:/api/resources/{resourceId}/maintenances
   * @secure
   */
  export namespace CreateMaintenance {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = CreateMaintenanceDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateMaintenanceData;
  }

  /**
   * @description Retrieve paginated list of maintenances for a specific resource with optional filtering
   * @tags Resource Maintenances
   * @name FindMaintenances
   * @summary Get maintenances for a resource
   * @request GET:/api/resources/{resourceId}/maintenances
   * @secure
   */
  export namespace FindMaintenances {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
    };
    export type RequestQuery = {
      /**
       * Page number for pagination
       * @default 1
       * @example 1
       */
      page?: number;
      /**
       * Number of items per page
       * @default 10
       * @example 10
       */
      limit?: number;
      /**
       * Include upcoming maintenances (start time in the future)
       * @default true
       * @example true
       */
      includeUpcoming?: boolean;
      /**
       * Include active maintenances (currently ongoing)
       * @default true
       * @example true
       */
      includeActive?: boolean;
      /**
       * Include past maintenances (already finished)
       * @default false
       * @example false
       */
      includePast?: boolean;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = FindMaintenancesData;
  }

  /**
   * @description Retrieve details of a specific maintenance
   * @tags Resource Maintenances
   * @name GetMaintenance
   * @summary Get a specific maintenance by ID
   * @request GET:/api/resources/{resourceId}/maintenances/{maintenanceId}
   * @secure
   */
  export namespace GetMaintenance {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
      /** The ID of the maintenance */
      maintenanceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetMaintenanceData;
  }

  /**
   * @description Update a maintenance with new start time, end time, and/or reason
   * @tags Resource Maintenances
   * @name UpdateMaintenance
   * @summary Update a maintenance
   * @request PUT:/api/resources/{resourceId}/maintenances/{maintenanceId}
   * @secure
   */
  export namespace UpdateMaintenance {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
      /** The ID of the maintenance */
      maintenanceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateMaintenanceDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateMaintenanceData;
  }

  /**
   * @description Delete a maintenance (cancel it)
   * @tags Resource Maintenances
   * @name CancelMaintenance
   * @summary Cancel a maintenance
   * @request DELETE:/api/resources/{resourceId}/maintenances/{maintenanceId}
   * @secure
   */
  export namespace CancelMaintenance {
    export type RequestParams = {
      /** The ID of the resource */
      resourceId: number;
      /** The ID of the maintenance */
      maintenanceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = CancelMaintenanceData;
  }
}

export namespace ResourceFlows {
  /**
   * @description Get the schemas for all node types
   * @tags Resource Flows
   * @name GetNodeSchemas
   * @summary Get node schemas
   * @request GET:/api/resources/{resourceId}/flow/node-schemas
   * @secure
   */
  export namespace GetNodeSchemas {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetNodeSchemasData;
  }

  /**
   * @description Retrieve the complete flow configuration for a resource, including all nodes and edges. This endpoint returns the workflow definition that determines what actions are triggered when resource usage events occur.
   * @tags Resource Flows
   * @name GetResourceFlow
   * @summary Get resource flow
   * @request GET:/api/resources/{resourceId}/flow
   * @secure
   */
  export namespace GetResourceFlow {
    export type RequestParams = {
      /**
       * The ID of the resource to get the flow for
       * @example 1
       */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetResourceFlowData;
  }

  /**
   * @description Save the complete flow configuration for a resource. This will replace all existing nodes and edges. The flow defines what actions (HTTP requests, MQTT messages, etc.) are triggered when resource usage events occur.
   * @tags Resource Flows
   * @name SaveResourceFlow
   * @summary Save resource flow
   * @request PUT:/api/resources/{resourceId}/flow
   * @secure
   */
  export namespace SaveResourceFlow {
    export type RequestParams = {
      /**
       * The ID of the resource to save the flow for
       * @example 1
       */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = ResourceFlowSaveDto;
    export type RequestHeaders = {};
    export type ResponseBody = SaveResourceFlowData;
  }

  /**
   * @description Retrieve the latest execution logs for a resource flow. Logs are returned in descending order by creation time (newest first). This endpoint provides insights into flow execution, including node processing status, errors, and execution details.
   * @tags Resource Flows
   * @name GetResourceFlowLogs
   * @summary Get resource flow logs
   * @request GET:/api/resources/{resourceId}/flow/logs
   * @secure
   */
  export namespace GetResourceFlowLogs {
    export type RequestParams = {
      /**
       * The ID of the resource to get the flow logs for
       * @example 1
       */
      resourceId: number;
    };
    export type RequestQuery = {
      /**
       * Page number (1-based)
       * @min 1
       * @default 1
       */
      page?: number;
      /**
       * Number of items per page
       * @min 1
       * @max 500
       * @default 50
       */
      limit?: number;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetResourceFlowLogsData;
  }

  /**
   * No description
   * @tags Resource Flows
   * @name ResourceFlowsControllerStreamEvents
   * @request GET:/api/resources/{resourceId}/flow/logs/live
   * @secure
   */
  export namespace ResourceFlowsControllerStreamEvents {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFlowsControllerStreamEventsData;
  }

  /**
   * @description Press a button to trigger the flow
   * @tags Resource Flows
   * @name PressButton
   * @summary Press a button
   * @request POST:/api/resources/{resourceId}/flow/buttons/{buttonId}/press
   * @secure
   */
  export namespace PressButton {
    export type RequestParams = {
      resourceId: number;
      /**
       * The ID of the button to press
       * @example "lsHVcGBwIbOGxez5fBM68"
       */
      buttonId: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = PressButtonData;
  }

  /**
   * @description Get buttons for a resource
   * @tags Resource Flows
   * @name GetButtons
   * @summary Get buttons
   * @request GET:/api/resources/{resourceId}/flow/buttons
   * @secure
   */
  export namespace GetButtons {
    export type RequestParams = {
      /**
       * The ID of the resource to get buttons for
       * @example 1
       */
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetButtonsData;
  }
}

export namespace Plugins {
  /**
   * No description
   * @tags Plugins
   * @name GetPlugins
   * @summary Get all plugins
   * @request GET:/api/plugins
   */
  export namespace GetPlugins {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetPluginsData;
  }

  /**
   * No description
   * @tags Plugins
   * @name UploadPlugin
   * @summary Upload a new plugin
   * @request POST:/api/plugins
   * @secure
   */
  export namespace UploadPlugin {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = UploadPluginDto;
    export type RequestHeaders = {};
    export type ResponseBody = any;
  }

  /**
   * No description
   * @tags Plugins
   * @name GetFrontendPluginFile
   * @summary Get any frontend plugin file
   * @request GET:/api/plugins/{pluginName}/frontend/module-federation/{filePath}
   */
  export namespace GetFrontendPluginFile {
    export type RequestParams = {
      pluginName: string;
      filePath: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetFrontendPluginFileData;
  }

  /**
   * No description
   * @tags Plugins
   * @name DeletePlugin
   * @summary Delete a plugin
   * @request DELETE:/api/plugins/{pluginId}
   * @secure
   */
  export namespace DeletePlugin {
    export type RequestParams = {
      pluginId: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeletePluginData;
  }
}

export namespace Attractap {
  /**
   * No description
   * @tags Attractap
   * @name EnrollNfcCard
   * @summary Enroll a new NFC card
   * @request POST:/api/attractap/readers/enroll-nfc-card
   * @secure
   */
  export namespace EnrollNfcCard {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = EnrollNfcCardDto;
    export type RequestHeaders = {};
    export type ResponseBody = EnrollNfcCardData;
  }

  /**
   * No description
   * @tags Attractap
   * @name ResetNfcCard
   * @summary Reset an NFC card
   * @request POST:/api/attractap/readers/reset-nfc-card
   * @secure
   */
  export namespace ResetNfcCard {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = ResetNfcCardDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResetNfcCardData;
  }

  /**
   * No description
   * @tags Attractap
   * @name UpdateReader
   * @summary Update reader name and connected resources
   * @request PATCH:/api/attractap/readers/{readerId}
   * @secure
   */
  export namespace UpdateReader {
    export type RequestParams = {
      /**
       * The ID of the reader to update
       * @example 1
       */
      readerId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateReaderDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateReaderData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetReaderById
   * @summary Get a reader by ID
   * @request GET:/api/attractap/readers/{readerId}
   * @secure
   */
  export namespace GetReaderById {
    export type RequestParams = {
      /**
       * The ID of the reader to get
       * @example 1
       */
      readerId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetReaderByIdData;
  }

  /**
   * No description
   * @tags Attractap
   * @name DeleteReader
   * @summary Delete a reader
   * @request DELETE:/api/attractap/readers/{readerId}
   * @secure
   */
  export namespace DeleteReader {
    export type RequestParams = {
      /**
       * The ID of the reader to delete
       * @example 1
       */
      readerId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeleteReaderData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetReaders
   * @summary Get all readers
   * @request GET:/api/attractap/readers
   * @secure
   */
  export namespace GetReaders {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetReadersData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetAppKeyByUid
   * @summary Get the app key for a card by UID
   * @request POST:/api/attractap/cards/keys
   * @secure
   */
  export namespace GetAppKeyByUid {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = AppKeyRequestDto;
    export type RequestHeaders = {};
    export type ResponseBody = GetAppKeyByUidData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetAllCards
   * @summary Get all of your cards
   * @request GET:/api/attractap/cards
   * @secure
   */
  export namespace GetAllCards {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetAllCardsData;
  }

  /**
   * No description
   * @tags Attractap
   * @name ToggleCardActive
   * @summary Activate or deactivate an NFC card
   * @request PATCH:/api/attractap/cards/{id}/active
   * @secure
   */
  export namespace ToggleCardActive {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = NfcCardSetActiveStateDto;
    export type RequestHeaders = {};
    export type ResponseBody = ToggleCardActiveData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetFirmwares
   * @summary Get all firmwares
   * @request GET:/api/attractap/firmwares
   * @secure
   */
  export namespace GetFirmwares {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetFirmwaresData;
  }

  /**
   * No description
   * @tags Attractap
   * @name GetFirmwareBinary
   * @summary Get a firmware by name and variant
   * @request GET:/api/attractap/firmwares/{firmwareName}/variants/{variantName}/{filename}
   */
  export namespace GetFirmwareBinary {
    export type RequestParams = {
      firmwareName: string;
      variantName: string;
      filename: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetFirmwareBinaryData;
  }
}

export namespace Analytics {
  /**
   * No description
   * @tags Analytics
   * @name AnalyticsControllerGetResourceUsageHoursInDateRange
   * @request GET:/api/analytics/resource-usage-hours
   * @secure
   */
  export namespace AnalyticsControllerGetResourceUsageHoursInDateRange {
    export type RequestParams = {};
    export type RequestQuery = {
      /**
       * The start date of the range
       * @format date-time
       * @example "2021-01-01"
       */
      start: string;
      /**
       * The end date of the range
       * @format date-time
       * @example "2021-01-01"
       */
      end: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody =
      AnalyticsControllerGetResourceUsageHoursInDateRangeData;
  }
}

export namespace Billing {
  /**
   * No description
   * @tags Billing
   * @name GetBillingBalance
   * @summary Get the billing balance for a user
   * @request GET:/api/users/{userId}/billing/balance
   * @secure
   */
  export namespace GetBillingBalance {
    export type RequestParams = {
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetBillingBalanceData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetBillingTransactions
   * @summary Get the billing transactions for a user
   * @request GET:/api/users/{userId}/billing/transactions
   * @secure
   */
  export namespace GetBillingTransactions {
    export type RequestParams = {
      userId: number;
    };
    export type RequestQuery = {
      /**
       * The page number to retrieve
       * @example 1
       */
      page?: number;
      /**
       * The number of items per page
       * @example 10
       */
      limit?: number;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetBillingTransactionsData;
  }

  /**
   * No description
   * @tags Billing
   * @name CreateManualTransaction
   * @summary Top up or charge the billing balance for a user
   * @request POST:/api/users/{userId}/billing/transactions
   * @secure
   */
  export namespace CreateManualTransaction {
    export type RequestParams = {
      userId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = ModifyBalanceDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateManualTransactionData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetBillingConfiguration
   * @summary Get the billing configuration for a resource
   * @request GET:/api/resources/{resourceId}/billing/configuration
   * @secure
   */
  export namespace GetBillingConfiguration {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetBillingConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name UpdateBillingConfiguration
   * @summary Update the billing configuration for a resource
   * @request POST:/api/resources/{resourceId}/billing/configuration
   * @secure
   */
  export namespace UpdateBillingConfiguration {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceBillingConfigurationDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateBillingConfigurationData;
  }
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) =>
      Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData()),
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response.clone() as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const data = !responseFormat
        ? r
        : await response[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Attraccess API
 * @version 1.0.0
 * @contact
 *
 * The Attraccess API used to manage machine and tool access in a Makerspace or FabLab
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  system = {
    /**
     * No description
     *
     * @tags System
     * @name Info
     * @summary Return API information
     * @request GET:/api/info
     */
    info: (params: RequestParams = {}) =>
      this.request<InfoData, any>({
        path: `/api/info`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  users = {
    /**
     * No description
     *
     * @tags Users
     * @name CreateOneUser
     * @summary Create a new user
     * @request POST:/api/users
     */
    createOneUser: (data: CreateUserDto, params: RequestParams = {}) =>
      this.request<CreateOneUserData, void>({
        path: `/api/users`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name FindMany
     * @summary Get a paginated list of users
     * @request GET:/api/users
     * @secure
     */
    findMany: (query: FindManyParams, params: RequestParams = {}) =>
      this.request<FindManyData, void>({
        path: `/api/users`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name VerifyEmail
     * @summary Verify a user email address
     * @request POST:/api/users/verify-email
     */
    verifyEmail: (data: VerifyEmailDto, params: RequestParams = {}) =>
      this.request<VerifyEmailData, void>({
        path: `/api/users/verify-email`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name RequestPasswordReset
     * @summary Request a password reset
     * @request POST:/api/users/reset-password
     */
    requestPasswordReset: (
      data: ResetPasswordDto,
      params: RequestParams = {},
    ) =>
      this.request<RequestPasswordResetData, void>({
        path: `/api/users/reset-password`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name ChangePasswordViaResetToken
     * @summary Change a user password after password reset
     * @request POST:/api/users/{userId}/change-password-by-token
     */
    changePasswordViaResetToken: (
      userId: number,
      data: ChangePasswordDto,
      params: RequestParams = {},
    ) =>
      this.request<ChangePasswordViaResetTokenData, void>({
        path: `/api/users/${userId}/change-password-by-token`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name GetCurrent
     * @summary Get the current authenticated user
     * @request GET:/api/users/me
     * @secure
     */
    getCurrent: (params: RequestParams = {}) =>
      this.request<GetCurrentData, void>({
        path: `/api/users/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name ChangeMyUsername
     * @summary Change current user username (limit once per day)
     * @request PATCH:/api/users/me/username
     * @secure
     */
    changeMyUsername: (data: ChangeUsernameDto, params: RequestParams = {}) =>
      this.request<ChangeMyUsernameData, void>({
        path: `/api/users/me/username`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name GetOneUserById
     * @summary Get a user by ID
     * @request GET:/api/users/{id}
     * @secure
     */
    getOneUserById: (id: number, params: RequestParams = {}) =>
      this.request<GetOneUserByIdData, GetOneUserByIdError>({
        path: `/api/users/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name UpdatePermissions
     * @summary Update a user's system permissions
     * @request PATCH:/api/users/{id}/permissions
     * @secure
     */
    updatePermissions: (
      id: number,
      data: UpdateUserPermissionsDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdatePermissionsData, void>({
        path: `/api/users/${id}/permissions`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name GetPermissions
     * @summary Get a user's system permissions
     * @request GET:/api/users/{id}/permissions
     * @secure
     */
    getPermissions: (id: number, params: RequestParams = {}) =>
      this.request<GetPermissionsData, void>({
        path: `/api/users/${id}/permissions`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name BulkUpdatePermissions
     * @summary Bulk update user permissions
     * @request POST:/api/users/permissions
     * @secure
     */
    bulkUpdatePermissions: (
      data: BulkUpdateUserPermissionsDto,
      params: RequestParams = {},
    ) =>
      this.request<BulkUpdatePermissionsData, void>({
        path: `/api/users/permissions`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name GetAllWithPermission
     * @summary Get users with a specific permission
     * @request GET:/api/users/with-permission
     * @secure
     */
    getAllWithPermission: (
      query: GetAllWithPermissionParams,
      params: RequestParams = {},
    ) =>
      this.request<GetAllWithPermissionData, void>({
        path: `/api/users/with-permission`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name SetUserPassword
     * @summary Set a user's password directly
     * @request POST:/api/users/{id}/password
     * @secure
     */
    setUserPassword: (
      id: number,
      data: SetUserPasswordDto,
      params: RequestParams = {},
    ) =>
      this.request<SetUserPasswordData, void>({
        path: `/api/users/${id}/password`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name ChangeUserUsername
     * @summary Admin: Change a user's username (no limit)
     * @request PATCH:/api/users/{id}/username
     * @secure
     */
    changeUserUsername: (
      id: number,
      data: ChangeUsernameDto,
      params: RequestParams = {},
    ) =>
      this.request<ChangeUserUsernameData, void>({
        path: `/api/users/${id}/username`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  authentication = {
    /**
     * No description
     *
     * @tags Authentication
     * @name CreateSession
     * @summary Create a new session using local authentication
     * @request POST:/api/auth/session/local
     */
    createSession: (data: CreateSessionPayload, params: RequestParams = {}) =>
      this.request<CreateSessionData, void>({
        path: `/api/auth/session/local`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name RefreshSession
     * @summary Refresh the current session
     * @request GET:/api/auth/session/refresh
     * @secure
     */
    refreshSession: (query: RefreshSessionParams, params: RequestParams = {}) =>
      this.request<RefreshSessionData, void>({
        path: `/api/auth/session/refresh`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name EndSession
     * @summary Logout and invalidate the current session
     * @request DELETE:/api/auth/session
     * @secure
     */
    endSession: (params: RequestParams = {}) =>
      this.request<EndSessionData, void>({
        path: `/api/auth/session`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name GetAllSsoProviders
     * @summary Get all SSO providers
     * @request GET:/api/auth/sso/providers
     */
    getAllSsoProviders: (params: RequestParams = {}) =>
      this.request<GetAllSsoProvidersData, any>({
        path: `/api/auth/sso/providers`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name CreateOneSsoProvider
     * @summary Create a new SSO provider
     * @request POST:/api/auth/sso/providers
     * @secure
     */
    createOneSsoProvider: (
      data: CreateSSOProviderDto,
      params: RequestParams = {},
    ) =>
      this.request<CreateOneSsoProviderData, void>({
        path: `/api/auth/sso/providers`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name LinkUserToExternalAccount
     * @summary Link an account to an external identifier
     * @request POST:/api/auth/sso/link-account
     */
    linkUserToExternalAccount: (
      data: LinkUserToExternalAccountRequestDto,
      params: RequestParams = {},
    ) =>
      this.request<LinkUserToExternalAccountData, any>({
        path: `/api/auth/sso/link-account`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name GetOneSsoProviderById
     * @summary Get SSO provider by ID with full configuration
     * @request GET:/api/auth/sso/providers/{id}
     * @secure
     */
    getOneSsoProviderById: (id: number, params: RequestParams = {}) =>
      this.request<GetOneSsoProviderByIdData, void>({
        path: `/api/auth/sso/providers/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name UpdateOneSsoProvider
     * @summary Update an existing SSO provider
     * @request PUT:/api/auth/sso/providers/{id}
     * @secure
     */
    updateOneSsoProvider: (
      id: number,
      data: UpdateSSOProviderDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateOneSsoProviderData, void>({
        path: `/api/auth/sso/providers/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name DeleteOneSsoProvider
     * @summary Delete an SSO provider
     * @request DELETE:/api/auth/sso/providers/{id}
     * @secure
     */
    deleteOneSsoProvider: (id: number, params: RequestParams = {}) =>
      this.request<DeleteOneSsoProviderData, void>({
        path: `/api/auth/sso/providers/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name DiscoverAuthentikOidc
     * @summary Proxy Authentik OIDC well-known discovery
     * @request GET:/api/auth/sso/discovery/authentik
     * @secure
     */
    discoverAuthentikOidc: (
      query: DiscoverAuthentikOidcParams,
      params: RequestParams = {},
    ) =>
      this.request<DiscoverAuthentikOidcData, void>({
        path: `/api/auth/sso/discovery/authentik`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name DiscoverKeycloakOidc
     * @summary Proxy Keycloak OIDC well-known discovery
     * @request GET:/api/auth/sso/discovery/keycloak
     * @secure
     */
    discoverKeycloakOidc: (
      query: DiscoverKeycloakOidcParams,
      params: RequestParams = {},
    ) =>
      this.request<DiscoverKeycloakOidcData, void>({
        path: `/api/auth/sso/discovery/keycloak`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * @description Login with OIDC and redirect to the callback URL (optional), if you intend to redirect to your frontned, your frontend should pass the query parameters back to the sso callback endpoint to retreive a JWT token for furhter authentication
     *
     * @tags Authentication
     * @name LoginWithOidc
     * @summary Login with OIDC
     * @request GET:/api/auth/sso/OIDC/{providerId}/login
     */
    loginWithOidc: (
      { providerId, ...query }: LoginWithOidcParams,
      params: RequestParams = {},
    ) =>
      this.request<LoginWithOidcData, any>({
        path: `/api/auth/sso/OIDC/${providerId}/login`,
        method: "GET",
        query: query,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name OidcLoginCallback
     * @summary Callback for OIDC login
     * @request GET:/api/auth/sso/OIDC/{providerId}/callback
     */
    oidcLoginCallback: (
      { providerId, ...query }: OidcLoginCallbackParams,
      params: RequestParams = {},
    ) =>
      this.request<OidcLoginCallbackData, any>({
        path: `/api/auth/sso/OIDC/${providerId}/callback`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  emailTemplates = {
    /**
     * No description
     *
     * @tags Email Templates
     * @name EmailTemplateControllerPreviewMjml
     * @summary Preview MJML content as HTML
     * @request POST:/api/email-templates/preview-mjml
     * @secure
     */
    emailTemplateControllerPreviewMjml: (
      data: PreviewMjmlDto,
      params: RequestParams = {},
    ) =>
      this.request<EmailTemplateControllerPreviewMjmlData, void>({
        path: `/api/email-templates/preview-mjml`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Email Templates
     * @name EmailTemplateControllerFindAll
     * @summary List all email templates
     * @request GET:/api/email-templates
     * @secure
     */
    emailTemplateControllerFindAll: (params: RequestParams = {}) =>
      this.request<EmailTemplateControllerFindAllData, void>({
        path: `/api/email-templates`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Email Templates
     * @name EmailTemplateControllerFindOne
     * @summary Get an email template by type
     * @request GET:/api/email-templates/{type}
     * @secure
     */
    emailTemplateControllerFindOne: (
      type:
        | "verify-email"
        | "reset-password"
        | "username-changed"
        | "password-changed",
      params: RequestParams = {},
    ) =>
      this.request<EmailTemplateControllerFindOneData, void>({
        path: `/api/email-templates/${type}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Email Templates
     * @name EmailTemplateControllerUpdate
     * @summary Update an email template
     * @request PATCH:/api/email-templates/{type}
     * @secure
     */
    emailTemplateControllerUpdate: (
      type:
        | "verify-email"
        | "reset-password"
        | "username-changed"
        | "password-changed",
      data: UpdateEmailTemplateDto,
      params: RequestParams = {},
    ) =>
      this.request<EmailTemplateControllerUpdateData, void>({
        path: `/api/email-templates/${type}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  license = {
    /**
     * No description
     *
     * @tags License
     * @name GetLicenseInformation
     * @summary Get license information
     * @request GET:/api/license-data
     * @secure
     */
    getLicenseInformation: (params: RequestParams = {}) =>
      this.request<GetLicenseInformationData, void>({
        path: `/api/license-data`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  resources = {
    /**
     * No description
     *
     * @tags Resources
     * @name CreateOneResource
     * @summary Create a new resource
     * @request POST:/api/resources
     * @secure
     */
    createOneResource: (data: CreateResourceDto, params: RequestParams = {}) =>
      this.request<CreateOneResourceData, void>({
        path: `/api/resources`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.FormData,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name GetAllResources
     * @summary Get all resources
     * @request GET:/api/resources
     * @secure
     */
    getAllResources: (
      query: GetAllResourcesParams,
      params: RequestParams = {},
    ) =>
      this.request<GetAllResourcesData, void>({
        path: `/api/resources`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name GetAllResourcesInUse
     * @summary Get all resources in use
     * @request GET:/api/resources/in-use
     */
    getAllResourcesInUse: (params: RequestParams = {}) =>
      this.request<GetAllResourcesInUseData, any>({
        path: `/api/resources/in-use`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name GetOneResourceById
     * @summary Get a resource by ID
     * @request GET:/api/resources/{id}
     * @secure
     */
    getOneResourceById: (id: number, params: RequestParams = {}) =>
      this.request<GetOneResourceByIdData, void>({
        path: `/api/resources/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name UpdateOneResource
     * @summary Update a resource
     * @request PUT:/api/resources/{id}
     * @secure
     */
    updateOneResource: (
      id: number,
      data: UpdateResourceDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateOneResourceData, void>({
        path: `/api/resources/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.FormData,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name DeleteOneResource
     * @summary Delete a resource
     * @request DELETE:/api/resources/{id}
     * @secure
     */
    deleteOneResource: (id: number, params: RequestParams = {}) =>
      this.request<DeleteOneResourceData, void>({
        path: `/api/resources/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name SseControllerStreamEvents
     * @request GET:/api/resources/{resourceId}/events
     */
    sseControllerStreamEvents: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<SseControllerStreamEventsData, any>({
        path: `/api/resources/${resourceId}/events`,
        method: "GET",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsCreateOne
     * @summary Create a new resource group
     * @request POST:/api/resource-groups
     * @secure
     */
    resourceGroupsCreateOne: (
      data: CreateResourceGroupDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupsCreateOneData, void>({
        path: `/api/resource-groups`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsGetMany
     * @summary Get many resource groups
     * @request GET:/api/resource-groups
     */
    resourceGroupsGetMany: (params: RequestParams = {}) =>
      this.request<ResourceGroupsGetManyData, any>({
        path: `/api/resource-groups`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsGetOne
     * @summary Get a resource group by ID
     * @request GET:/api/resource-groups/{id}
     */
    resourceGroupsGetOne: (id: number, params: RequestParams = {}) =>
      this.request<ResourceGroupsGetOneData, void>({
        path: `/api/resource-groups/${id}`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsUpdateOne
     * @summary Update a resource group by ID
     * @request PUT:/api/resource-groups/{id}
     * @secure
     */
    resourceGroupsUpdateOne: (
      id: number,
      data: UpdateResourceGroupDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupsUpdateOneData, void>({
        path: `/api/resource-groups/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsAddResource
     * @summary Add a resource to a resource group
     * @request POST:/api/resource-groups/{groupId}/resources/{resourceId}
     * @secure
     */
    resourceGroupsAddResource: (
      groupId: number,
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupsAddResourceData, void>({
        path: `/api/resource-groups/${groupId}/resources/${resourceId}`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsRemoveResource
     * @summary Remove a resource from a resource group
     * @request DELETE:/api/resource-groups/{groupId}/resources/{resourceId}
     * @secure
     */
    resourceGroupsRemoveResource: (
      groupId: number,
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupsRemoveResourceData, void>({
        path: `/api/resource-groups/${groupId}/resources/${resourceId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceGroupsDeleteOne
     * @summary Delete a resource group by ID
     * @request DELETE:/api/resource-groups/{groupId}
     * @secure
     */
    resourceGroupsDeleteOne: (groupId: number, params: RequestParams = {}) =>
      this.request<ResourceGroupsDeleteOneData, void>({
        path: `/api/resource-groups/${groupId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceUsageStartSession
     * @summary Start a resource usage session
     * @request POST:/api/resources/{resourceId}/usage/start
     * @secure
     */
    resourceUsageStartSession: (
      resourceId: number,
      data: StartUsageSessionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceUsageStartSessionData, void>({
        path: `/api/resources/${resourceId}/usage/start`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceUsageEndSession
     * @summary End a resource usage session
     * @request PUT:/api/resources/{resourceId}/usage/end
     * @secure
     */
    resourceUsageEndSession: (
      resourceId: number,
      data: EndUsageSessionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceUsageEndSessionData, void>({
        path: `/api/resources/${resourceId}/usage/end`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name LockDoor
     * @summary Lock a resource of door type
     * @request POST:/api/resources/{resourceId}/usage/lock
     * @secure
     */
    lockDoor: (resourceId: number, params: RequestParams = {}) =>
      this.request<LockDoorData, void>({
        path: `/api/resources/${resourceId}/usage/lock`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name UnlockDoor
     * @summary Unlock a resource of door type
     * @request POST:/api/resources/{resourceId}/usage/unlock
     * @secure
     */
    unlockDoor: (resourceId: number, params: RequestParams = {}) =>
      this.request<UnlockDoorData, void>({
        path: `/api/resources/${resourceId}/usage/unlock`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name UnlatchDoor
     * @summary Unlatch a resource of door type (if supported)
     * @request POST:/api/resources/{resourceId}/usage/unlatch
     * @secure
     */
    unlatchDoor: (resourceId: number, params: RequestParams = {}) =>
      this.request<UnlatchDoorData, void>({
        path: `/api/resources/${resourceId}/usage/unlatch`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceUsageGetHistory
     * @summary Get usage history for a resource
     * @request GET:/api/resources/{resourceId}/usage/history
     * @secure
     */
    resourceUsageGetHistory: (
      { resourceId, ...query }: ResourceUsageGetHistoryParams,
      params: RequestParams = {},
    ) =>
      this.request<ResourceUsageGetHistoryData, void>({
        path: `/api/resources/${resourceId}/usage/history`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceUsageGetActiveSession
     * @summary Get active usage session for current user
     * @request GET:/api/resources/{resourceId}/usage/active
     * @secure
     */
    resourceUsageGetActiveSession: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceUsageGetActiveSessionData, void>({
        path: `/api/resources/${resourceId}/usage/active`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resources
     * @name ResourceUsageCanControl
     * @summary Check if the current user can control a resource
     * @request GET:/api/resources/{resourceId}/usage/can-control
     * @secure
     */
    resourceUsageCanControl: (resourceId: number, params: RequestParams = {}) =>
      this.request<ResourceUsageCanControlData, void>({
        path: `/api/resources/${resourceId}/usage/can-control`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  mqtt = {
    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersGetAll
     * @summary Get all MQTT servers
     * @request GET:/api/mqtt/servers
     * @secure
     */
    mqttServersGetAll: (params: RequestParams = {}) =>
      this.request<MqttServersGetAllData, void>({
        path: `/api/mqtt/servers`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersCreateOne
     * @summary Create new MQTT server
     * @request POST:/api/mqtt/servers
     * @secure
     */
    mqttServersCreateOne: (
      data: CreateMqttServerDto,
      params: RequestParams = {},
    ) =>
      this.request<MqttServersCreateOneData, void>({
        path: `/api/mqtt/servers`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersGetOneById
     * @summary Get MQTT server by ID
     * @request GET:/api/mqtt/servers/{id}
     * @secure
     */
    mqttServersGetOneById: (id: number, params: RequestParams = {}) =>
      this.request<MqttServersGetOneByIdData, void>({
        path: `/api/mqtt/servers/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersUpdateOne
     * @summary Update MQTT server
     * @request PUT:/api/mqtt/servers/{id}
     * @secure
     */
    mqttServersUpdateOne: (
      id: number,
      data: UpdateMqttServerDto,
      params: RequestParams = {},
    ) =>
      this.request<MqttServersUpdateOneData, void>({
        path: `/api/mqtt/servers/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersDeleteOne
     * @summary Delete MQTT server
     * @request DELETE:/api/mqtt/servers/{id}
     * @secure
     */
    mqttServersDeleteOne: (id: number, params: RequestParams = {}) =>
      this.request<MqttServersDeleteOneData, void>({
        path: `/api/mqtt/servers/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersTestConnection
     * @summary Test MQTT server connection
     * @request POST:/api/mqtt/servers/{id}/test
     * @secure
     */
    mqttServersTestConnection: (id: number, params: RequestParams = {}) =>
      this.request<MqttServersTestConnectionData, void>({
        path: `/api/mqtt/servers/${id}/test`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersGetStatusOfOne
     * @summary Get MQTT server connection status and statistics
     * @request GET:/api/mqtt/servers/{id}/status
     * @secure
     */
    mqttServersGetStatusOfOne: (id: number, params: RequestParams = {}) =>
      this.request<MqttServersGetStatusOfOneData, void>({
        path: `/api/mqtt/servers/${id}/status`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags MQTT
     * @name MqttServersGetStatusOfAll
     * @summary Get all MQTT server connection statuses and statistics
     * @request GET:/api/mqtt/servers/status
     * @secure
     */
    mqttServersGetStatusOfAll: (params: RequestParams = {}) =>
      this.request<MqttServersGetStatusOfAllData, void>({
        path: `/api/mqtt/servers/status`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  accessControl = {
    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroductionsGetMany
     * @summary Get many introductions by group ID
     * @request GET:/api/resource-groups/{groupId}/introductions
     * @secure
     */
    resourceGroupIntroductionsGetMany: (
      groupId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroductionsGetManyData, void>({
        path: `/api/resource-groups/${groupId}/introductions`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroductionsGetHistory
     * @summary Get history of introductions by group ID and user ID
     * @request GET:/api/resource-groups/{groupId}/introductions/{userId}/history
     * @secure
     */
    resourceGroupIntroductionsGetHistory: (
      groupId: number,
      userId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroductionsGetHistoryData, void>({
        path: `/api/resource-groups/${groupId}/introductions/${userId}/history`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroductionsGrant
     * @summary Grant introduction permission for a resource group to a user
     * @request POST:/api/resource-groups/{groupId}/introductions/{userId}/grant
     * @secure
     */
    resourceGroupIntroductionsGrant: (
      groupId: number,
      userId: number,
      data: UpdateResourceGroupIntroductionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroductionsGrantData, void>({
        path: `/api/resource-groups/${groupId}/introductions/${userId}/grant`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroductionsRevoke
     * @summary Revoke introduction permission for a resource group from a user
     * @request POST:/api/resource-groups/{groupId}/introductions/{userId}/revoke
     * @secure
     */
    resourceGroupIntroductionsRevoke: (
      groupId: number,
      userId: number,
      data: UpdateResourceGroupIntroductionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroductionsRevokeData, void>({
        path: `/api/resource-groups/${groupId}/introductions/${userId}/revoke`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroducersGetMany
     * @summary Get all introducers for a resource group
     * @request GET:/api/resource-groups/{groupId}/introducers
     */
    resourceGroupIntroducersGetMany: (
      groupId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroducersGetManyData, void>({
        path: `/api/resource-groups/${groupId}/introducers`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroducersIsIntroducer
     * @summary Check if a user is an introducer for a resource group
     * @request GET:/api/resource-groups/{groupId}/introducers/{userId}/is-introducer
     */
    resourceGroupIntroducersIsIntroducer: (
      userId: number,
      groupId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroducersIsIntroducerData, any>({
        path: `/api/resource-groups/${groupId}/introducers/${userId}/is-introducer`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroducersGrant
     * @summary Grant a user introduction permission for a resource group
     * @request POST:/api/resource-groups/{groupId}/introducers/{userId}/grant
     * @secure
     */
    resourceGroupIntroducersGrant: (
      userId: number,
      groupId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroducersGrantData, void>({
        path: `/api/resource-groups/${groupId}/introducers/${userId}/grant`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceGroupIntroducersRevoke
     * @summary Revoke a user introduction permission for a resource group
     * @request POST:/api/resource-groups/{groupId}/introducers/{userId}/revoke
     * @secure
     */
    resourceGroupIntroducersRevoke: (
      userId: number,
      groupId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceGroupIntroducersRevokeData, void>({
        path: `/api/resource-groups/${groupId}/introducers/${userId}/revoke`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroducersIsIntroducer
     * @summary Check if a user is an introducer for a resource
     * @request GET:/api/resources/{resourceId}/introducers/{userId}/is-introducer
     */
    resourceIntroducersIsIntroducer: (
      { resourceId, userId, ...query }: ResourceIntroducersIsIntroducerParams,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroducersIsIntroducerData, any>({
        path: `/api/resources/${resourceId}/introducers/${userId}/is-introducer`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroducersGetMany
     * @summary Get all introducers for a resource
     * @request GET:/api/resources/{resourceId}/introducers
     */
    resourceIntroducersGetMany: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroducersGetManyData, any>({
        path: `/api/resources/${resourceId}/introducers`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroducersGrant
     * @summary Grant a user introduction permission for a resource
     * @request POST:/api/resources/{resourceId}/introducers/{userId}/grant
     * @secure
     */
    resourceIntroducersGrant: (
      resourceId: number,
      userId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroducersGrantData, void>({
        path: `/api/resources/${resourceId}/introducers/${userId}/grant`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroducersRevoke
     * @summary Revoke a user introduction permission for a resource
     * @request DELETE:/api/resources/{resourceId}/introducers/{userId}/revoke
     * @secure
     */
    resourceIntroducersRevoke: (
      resourceId: number,
      userId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroducersRevokeData, void>({
        path: `/api/resources/${resourceId}/introducers/${userId}/revoke`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroductionsGetMany
     * @summary Get all introductions for a resource
     * @request GET:/api/resources/{resourceId}/introductions
     */
    resourceIntroductionsGetMany: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroductionsGetManyData, any>({
        path: `/api/resources/${resourceId}/introductions`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroductionsGrant
     * @summary Grant a user usage permission for a resource
     * @request POST:/api/resources/{resourceId}/introductions/{userId}/grant
     * @secure
     */
    resourceIntroductionsGrant: (
      resourceId: number,
      userId: number,
      data: UpdateResourceIntroductionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroductionsGrantData, void>({
        path: `/api/resources/${resourceId}/introductions/${userId}/grant`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroductionsRevoke
     * @summary Revoke a user usage permission for a resource
     * @request DELETE:/api/resources/{resourceId}/introductions/{userId}/revoke
     * @secure
     */
    resourceIntroductionsRevoke: (
      resourceId: number,
      userId: number,
      data: UpdateResourceIntroductionDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroductionsRevokeData, void>({
        path: `/api/resources/${resourceId}/introductions/${userId}/revoke`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Access Control
     * @name ResourceIntroductionsGetHistory
     * @summary Get history of introductions by resource ID and user ID
     * @request GET:/api/resources/{resourceId}/introductions/{userId}/history
     * @secure
     */
    resourceIntroductionsGetHistory: (
      resourceId: number,
      userId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceIntroductionsGetHistoryData, void>({
        path: `/api/resources/${resourceId}/introductions/${userId}/history`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  resourceMaintenances = {
    /**
     * @description Check if the authenticated user has permission to manage maintenance for the specified resource
     *
     * @tags Resource Maintenances
     * @name CanManageMaintenance
     * @summary Check if user can manage maintenance
     * @request GET:/api/resources/{resourceId}/maintenances/can-manage
     * @secure
     */
    canManageMaintenance: (resourceId: number, params: RequestParams = {}) =>
      this.request<CanManageMaintenanceData, void>({
        path: `/api/resources/${resourceId}/maintenances/can-manage`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a new maintenance schedule for a specific resource
     *
     * @tags Resource Maintenances
     * @name CreateMaintenance
     * @summary Create a maintenance for a resource
     * @request POST:/api/resources/{resourceId}/maintenances
     * @secure
     */
    createMaintenance: (
      resourceId: number,
      data: CreateMaintenanceDto,
      params: RequestParams = {},
    ) =>
      this.request<CreateMaintenanceData, void>({
        path: `/api/resources/${resourceId}/maintenances`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Retrieve paginated list of maintenances for a specific resource with optional filtering
     *
     * @tags Resource Maintenances
     * @name FindMaintenances
     * @summary Get maintenances for a resource
     * @request GET:/api/resources/{resourceId}/maintenances
     * @secure
     */
    findMaintenances: (
      { resourceId, ...query }: FindMaintenancesParams,
      params: RequestParams = {},
    ) =>
      this.request<FindMaintenancesData, void>({
        path: `/api/resources/${resourceId}/maintenances`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Retrieve details of a specific maintenance
     *
     * @tags Resource Maintenances
     * @name GetMaintenance
     * @summary Get a specific maintenance by ID
     * @request GET:/api/resources/{resourceId}/maintenances/{maintenanceId}
     * @secure
     */
    getMaintenance: (
      resourceId: number,
      maintenanceId: number,
      params: RequestParams = {},
    ) =>
      this.request<GetMaintenanceData, void>({
        path: `/api/resources/${resourceId}/maintenances/${maintenanceId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update a maintenance with new start time, end time, and/or reason
     *
     * @tags Resource Maintenances
     * @name UpdateMaintenance
     * @summary Update a maintenance
     * @request PUT:/api/resources/{resourceId}/maintenances/{maintenanceId}
     * @secure
     */
    updateMaintenance: (
      resourceId: number,
      maintenanceId: number,
      data: UpdateMaintenanceDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateMaintenanceData, void>({
        path: `/api/resources/${resourceId}/maintenances/${maintenanceId}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a maintenance (cancel it)
     *
     * @tags Resource Maintenances
     * @name CancelMaintenance
     * @summary Cancel a maintenance
     * @request DELETE:/api/resources/{resourceId}/maintenances/{maintenanceId}
     * @secure
     */
    cancelMaintenance: (
      resourceId: number,
      maintenanceId: number,
      params: RequestParams = {},
    ) =>
      this.request<CancelMaintenanceData, void>({
        path: `/api/resources/${resourceId}/maintenances/${maintenanceId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  };
  resourceFlows = {
    /**
     * @description Get the schemas for all node types
     *
     * @tags Resource Flows
     * @name GetNodeSchemas
     * @summary Get node schemas
     * @request GET:/api/resources/{resourceId}/flow/node-schemas
     * @secure
     */
    getNodeSchemas: (resourceId: number, params: RequestParams = {}) =>
      this.request<GetNodeSchemasData, void>({
        path: `/api/resources/${resourceId}/flow/node-schemas`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Retrieve the complete flow configuration for a resource, including all nodes and edges. This endpoint returns the workflow definition that determines what actions are triggered when resource usage events occur.
     *
     * @tags Resource Flows
     * @name GetResourceFlow
     * @summary Get resource flow
     * @request GET:/api/resources/{resourceId}/flow
     * @secure
     */
    getResourceFlow: (resourceId: number, params: RequestParams = {}) =>
      this.request<GetResourceFlowData, GetResourceFlowError>({
        path: `/api/resources/${resourceId}/flow`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Save the complete flow configuration for a resource. This will replace all existing nodes and edges. The flow defines what actions (HTTP requests, MQTT messages, etc.) are triggered when resource usage events occur.
     *
     * @tags Resource Flows
     * @name SaveResourceFlow
     * @summary Save resource flow
     * @request PUT:/api/resources/{resourceId}/flow
     * @secure
     */
    saveResourceFlow: (
      resourceId: number,
      data: ResourceFlowSaveDto,
      params: RequestParams = {},
    ) =>
      this.request<SaveResourceFlowData, SaveResourceFlowError>({
        path: `/api/resources/${resourceId}/flow`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Retrieve the latest execution logs for a resource flow. Logs are returned in descending order by creation time (newest first). This endpoint provides insights into flow execution, including node processing status, errors, and execution details.
     *
     * @tags Resource Flows
     * @name GetResourceFlowLogs
     * @summary Get resource flow logs
     * @request GET:/api/resources/{resourceId}/flow/logs
     * @secure
     */
    getResourceFlowLogs: (
      { resourceId, ...query }: GetResourceFlowLogsParams,
      params: RequestParams = {},
    ) =>
      this.request<GetResourceFlowLogsData, GetResourceFlowLogsError>({
        path: `/api/resources/${resourceId}/flow/logs`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resource Flows
     * @name ResourceFlowsControllerStreamEvents
     * @request GET:/api/resources/{resourceId}/flow/logs/live
     * @secure
     */
    resourceFlowsControllerStreamEvents: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFlowsControllerStreamEventsData, void>({
        path: `/api/resources/${resourceId}/flow/logs/live`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * @description Press a button to trigger the flow
     *
     * @tags Resource Flows
     * @name PressButton
     * @summary Press a button
     * @request POST:/api/resources/{resourceId}/flow/buttons/{buttonId}/press
     * @secure
     */
    pressButton: (
      resourceId: number,
      buttonId: string,
      params: RequestParams = {},
    ) =>
      this.request<PressButtonData, void>({
        path: `/api/resources/${resourceId}/flow/buttons/${buttonId}/press`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get buttons for a resource
     *
     * @tags Resource Flows
     * @name GetButtons
     * @summary Get buttons
     * @request GET:/api/resources/{resourceId}/flow/buttons
     * @secure
     */
    getButtons: (resourceId: number, params: RequestParams = {}) =>
      this.request<GetButtonsData, void>({
        path: `/api/resources/${resourceId}/flow/buttons`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  plugins = {
    /**
     * No description
     *
     * @tags Plugins
     * @name GetPlugins
     * @summary Get all plugins
     * @request GET:/api/plugins
     */
    getPlugins: (params: RequestParams = {}) =>
      this.request<GetPluginsData, any>({
        path: `/api/plugins`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Plugins
     * @name UploadPlugin
     * @summary Upload a new plugin
     * @request POST:/api/plugins
     * @secure
     */
    uploadPlugin: (data: UploadPluginDto, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/api/plugins`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.FormData,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Plugins
     * @name GetFrontendPluginFile
     * @summary Get any frontend plugin file
     * @request GET:/api/plugins/{pluginName}/frontend/module-federation/{filePath}
     */
    getFrontendPluginFile: (
      pluginName: string,
      filePath: string,
      params: RequestParams = {},
    ) =>
      this.request<GetFrontendPluginFileData, any>({
        path: `/api/plugins/${pluginName}/frontend/module-federation/${filePath}`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Plugins
     * @name DeletePlugin
     * @summary Delete a plugin
     * @request DELETE:/api/plugins/{pluginId}
     * @secure
     */
    deletePlugin: (pluginId: string, params: RequestParams = {}) =>
      this.request<DeletePluginData, void>({
        path: `/api/plugins/${pluginId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  };
  attractap = {
    /**
     * No description
     *
     * @tags Attractap
     * @name EnrollNfcCard
     * @summary Enroll a new NFC card
     * @request POST:/api/attractap/readers/enroll-nfc-card
     * @secure
     */
    enrollNfcCard: (data: EnrollNfcCardDto, params: RequestParams = {}) =>
      this.request<EnrollNfcCardData, void>({
        path: `/api/attractap/readers/enroll-nfc-card`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name ResetNfcCard
     * @summary Reset an NFC card
     * @request POST:/api/attractap/readers/reset-nfc-card
     * @secure
     */
    resetNfcCard: (data: ResetNfcCardDto, params: RequestParams = {}) =>
      this.request<ResetNfcCardData, void>({
        path: `/api/attractap/readers/reset-nfc-card`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name UpdateReader
     * @summary Update reader name and connected resources
     * @request PATCH:/api/attractap/readers/{readerId}
     * @secure
     */
    updateReader: (
      readerId: number,
      data: UpdateReaderDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateReaderData, void>({
        path: `/api/attractap/readers/${readerId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetReaderById
     * @summary Get a reader by ID
     * @request GET:/api/attractap/readers/{readerId}
     * @secure
     */
    getReaderById: (readerId: number, params: RequestParams = {}) =>
      this.request<GetReaderByIdData, void>({
        path: `/api/attractap/readers/${readerId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name DeleteReader
     * @summary Delete a reader
     * @request DELETE:/api/attractap/readers/{readerId}
     * @secure
     */
    deleteReader: (readerId: number, params: RequestParams = {}) =>
      this.request<DeleteReaderData, void>({
        path: `/api/attractap/readers/${readerId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetReaders
     * @summary Get all readers
     * @request GET:/api/attractap/readers
     * @secure
     */
    getReaders: (params: RequestParams = {}) =>
      this.request<GetReadersData, void>({
        path: `/api/attractap/readers`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetAppKeyByUid
     * @summary Get the app key for a card by UID
     * @request POST:/api/attractap/cards/keys
     * @secure
     */
    getAppKeyByUid: (data: AppKeyRequestDto, params: RequestParams = {}) =>
      this.request<GetAppKeyByUidData, void>({
        path: `/api/attractap/cards/keys`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetAllCards
     * @summary Get all of your cards
     * @request GET:/api/attractap/cards
     * @secure
     */
    getAllCards: (params: RequestParams = {}) =>
      this.request<GetAllCardsData, void>({
        path: `/api/attractap/cards`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name ToggleCardActive
     * @summary Activate or deactivate an NFC card
     * @request PATCH:/api/attractap/cards/{id}/active
     * @secure
     */
    toggleCardActive: (
      id: number,
      data: NfcCardSetActiveStateDto,
      params: RequestParams = {},
    ) =>
      this.request<ToggleCardActiveData, void>({
        path: `/api/attractap/cards/${id}/active`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetFirmwares
     * @summary Get all firmwares
     * @request GET:/api/attractap/firmwares
     * @secure
     */
    getFirmwares: (params: RequestParams = {}) =>
      this.request<GetFirmwaresData, void>({
        path: `/api/attractap/firmwares`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attractap
     * @name GetFirmwareBinary
     * @summary Get a firmware by name and variant
     * @request GET:/api/attractap/firmwares/{firmwareName}/variants/{variantName}/{filename}
     */
    getFirmwareBinary: (
      firmwareName: string,
      variantName: string,
      filename: string,
      params: RequestParams = {},
    ) =>
      this.request<GetFirmwareBinaryData, any>({
        path: `/api/attractap/firmwares/${firmwareName}/variants/${variantName}/${filename}`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  analytics = {
    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsControllerGetResourceUsageHoursInDateRange
     * @request GET:/api/analytics/resource-usage-hours
     * @secure
     */
    analyticsControllerGetResourceUsageHoursInDateRange: (
      query: AnalyticsControllerGetResourceUsageHoursInDateRangeParams,
      params: RequestParams = {},
    ) =>
      this.request<
        AnalyticsControllerGetResourceUsageHoursInDateRangeData,
        void
      >({
        path: `/api/analytics/resource-usage-hours`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  billing = {
    /**
     * No description
     *
     * @tags Billing
     * @name GetBillingBalance
     * @summary Get the billing balance for a user
     * @request GET:/api/users/{userId}/billing/balance
     * @secure
     */
    getBillingBalance: (userId: number, params: RequestParams = {}) =>
      this.request<GetBillingBalanceData, void>({
        path: `/api/users/${userId}/billing/balance`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name GetBillingTransactions
     * @summary Get the billing transactions for a user
     * @request GET:/api/users/{userId}/billing/transactions
     * @secure
     */
    getBillingTransactions: (
      { userId, ...query }: GetBillingTransactionsParams,
      params: RequestParams = {},
    ) =>
      this.request<GetBillingTransactionsData, void>({
        path: `/api/users/${userId}/billing/transactions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name CreateManualTransaction
     * @summary Top up or charge the billing balance for a user
     * @request POST:/api/users/{userId}/billing/transactions
     * @secure
     */
    createManualTransaction: (
      userId: number,
      data: ModifyBalanceDto,
      params: RequestParams = {},
    ) =>
      this.request<CreateManualTransactionData, void>({
        path: `/api/users/${userId}/billing/transactions`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name GetBillingConfiguration
     * @summary Get the billing configuration for a resource
     * @request GET:/api/resources/{resourceId}/billing/configuration
     * @secure
     */
    getBillingConfiguration: (resourceId: number, params: RequestParams = {}) =>
      this.request<GetBillingConfigurationData, void>({
        path: `/api/resources/${resourceId}/billing/configuration`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name UpdateBillingConfiguration
     * @summary Update the billing configuration for a resource
     * @request POST:/api/resources/{resourceId}/billing/configuration
     * @secure
     */
    updateBillingConfiguration: (
      resourceId: number,
      data: UpdateResourceBillingConfigurationDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateBillingConfigurationData, void>({
        path: `/api/resources/${resourceId}/billing/configuration`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
}
