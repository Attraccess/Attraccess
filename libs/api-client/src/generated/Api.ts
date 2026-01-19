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

/** The type of the log entry */
export enum ResourceFlowLogType {
  FlowStart = "flow.start",
  NodeProcessingStarted = "node.processing.started",
  NodeProcessingFailed = "node.processing.failed",
  NodeProcessingCompleted = "node.processing.completed",
  FlowCompleted = "flow.completed",
}

/** The name of the node type */
export enum ResourceFlowNodeType {
  InputButton = "input.button",
  InputResourceUsageStarted = "input.resource.usage.started",
  InputResourceUsageStopped = "input.resource.usage.stopped",
  InputResourceUsageTakeover = "input.resource.usage.takeover",
  InputResourceDoorUnlocked = "input.resource.door.unlocked",
  InputResourceDoorLocked = "input.resource.door.locked",
  InputResourceDoorUnlatched = "input.resource.door.unlatched",
  InputMqttMessageReceived = "input.mqtt.message.received",
  InputResourceActivityNoActivity = "input.resource.activity.no-activity",
  OutputHttpSendRequest = "output.http.sendRequest",
  OutputMqttSendMessage = "output.mqtt.sendMessage",
  OutputResourceBillingCalculationSetAdditionalItems = "output.resource.billing.calculation.set-additional-items",
  OutputResourceUsageEndSession = "output.resource.usage.end-session",
  OutputResourceActivityTrackActivity = "output.resource.activity.track-activity",
  ProcessingWait = "processing.wait",
  ProcessingIf = "processing.if",
  ProcessingSetPayload = "processing.set-payload",
  ProcessingMqttWaitForMessage = "processing.mqtt.waitForMessage",
  ProcessingError = "processing.error",
}

/** The status of the transaction */
export enum SumupTransactionStatus {
  Successful = "successful",
  Failed = "failed",
}

/** The type of the transaction */
export enum SumupTransactionEventType {
  SoloTransactionUpdated = "solo.transaction.updated",
}

export enum SumUpReaderModel {
  Solo = "solo",
  VirtualSolo = "virtual-solo",
}

export enum SumUpReaderStatus {
  Unknown = "unknown",
  Processing = "processing",
  Paired = "paired",
  Expired = "expired",
}

/** The currency to use */
export enum Currency {
  EUR = "EUR",
}

/** The status of the billing transaction */
export enum BillingTransactionStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}

/** The action performed (revoke or grant) */
export enum IntroductionHistoryAction {
  Revoke = "revoke",
  Grant = "grant",
}

/** Current status of the invitation */
export enum ProjectInvitationStatus {
  Pending = "pending",
  Accepted = "accepted",
  Declined = "declined",
  Canceled = "canceled",
}

/** Role of the member within the project */
export enum ProjectMemberRole {
  Viewer = "viewer",
}

/** The type of usage */
export enum ResourceUsageAction {
  Usage = "usage",
  DoorLock = "door.lock",
  DoorUnlock = "door.unlock",
  DoorUnlatch = "door.unlatch",
}

/** The type of the form field */
export enum FormFieldType {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Select = "select",
}

/** The type of documentation (markdown or url) */
export enum DocumentationType {
  Markdown = "markdown",
  Url = "url",
}

/** The type of the resource */
export enum ResourceType {
  Machine = "machine",
  Door = "door",
}

/** Template type/key used by the system */
export enum EmailTemplateType {
  VerifyEmail = "verify-email",
  UserInvitation = "user-invitation",
  ResetPassword = "reset-password",
  UsernameChanged = "username-changed",
  PasswordChanged = "password-changed",
  ResourceUsageBillingTransactionSummary = "resource-usage-billing-transaction-summary",
  ProjectInvitation = "project-invitation",
}

/** The type of the provider */
export enum SSOProviderType {
  OIDC = "OIDC",
}

export enum PermissionFilter {
  CanManageResources = "canManageResources",
  CanManageSystemConfiguration = "canManageSystemConfiguration",
  CanManageUsers = "canManageUsers",
}

/** The authentication strategy to use */
export enum AuthenticationType {
  LocalPassword = "local_password",
  Sso = "sso",
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
  strategy: AuthenticationType;
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
  /**
   * The percentage rate the user to actually pay for activities that cost credits
   * @example 100
   */
  billingFactor: number;
}

export interface InviteUserDto {
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
}

export interface CsvInvitePermissionMappingDto {
  /** CSV column header that maps to this permission */
  keyMapping: string;
  /** CSV value that represents a YES for this permission */
  yesValue: string;
}

export interface CsvInvitePermissionsDto {
  canManageResources: CsvInvitePermissionMappingDto;
  canManageSystemConfiguration: CsvInvitePermissionMappingDto;
  canManageUsers: CsvInvitePermissionMappingDto;
  canManageBilling: CsvInvitePermissionMappingDto;
}

export interface CsvInviteConfigDto {
  /** CSV column header containing the email */
  emailKey: string;
  /** CSV column header containing the username */
  usernameKey: string;
  permissions: CsvInvitePermissionsDto;
  /** 1-based row numbers (excluding header) to skip when importing */
  ignoredRows?: number[];
}

export interface CsvInviteUploadDto {
  /** @format binary */
  file: File;
  /** JSON string or object describing how to map CSV columns to fields */
  config: CsvInviteConfigDto;
}

export interface CsvInviteRowErrorDto {
  /** 1-based row number (excluding header) */
  row: number;
  field?: string;
  message: string;
  value?: string;
}

export interface CsvInviteErrorResponseDto {
  /** @default "CSV import failed" */
  message: string;
  errors: CsvInviteRowErrorDto[];
}

export interface BooleanDto {
  /**
   * The boolean value
   * @example true
   */
  value: boolean;
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

export interface AcceptInvitationDto {
  /**
   * The token to accept the invitation
   * @example "1234567890"
   */
  token: string;
  /**
   * The email of the invite
   * @example "john.doe@example.com"
   */
  email: string;
  /**
   * The password for the user
   * @example "password123"
   */
  password: string;
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

export interface ChangeBillingFactorDto {
  /**
   * The new billing factor
   * @example 50
   */
  billingFactor: number;
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
   * Optional list of OIDC scopes to request
   * @example ["openid","email","profile"]
   */
  scopes?: string[];
  /**
   * Ordered list of claim paths to resolve the username
   * @example ["preferred_username","email","sub"]
   */
  usernameClaimPaths?: string[];
  /**
   * Ordered list of claim paths to resolve the email
   * @example ["email","emails[0].value","upn"]
   */
  emailClaimPaths?: string[];
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
   * The password of the user
   * @example "password"
   */
  password: string;
  /**
   * The short-lived token issued by the backend during SSO linking
   * @example "eyJhbGciOi...signed"
   */
  linkToken: string;
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
  /**
   * Optional list of OIDC scopes to request
   * @example ["openid","email","profile"]
   */
  scopes?: string[];
  /**
   * Ordered list of claim paths to resolve the username
   * @example ["preferred_username","email","sub"]
   */
  usernameClaimPaths?: string[];
  /**
   * Ordered list of claim paths to resolve the email
   * @example ["email","emails[0].value","upn"]
   */
  emailClaimPaths?: string[];
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
  type: SSOProviderType;
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
  /**
   * Optional list of OIDC scopes to request
   * @example ["openid","email","profile"]
   */
  scopes?: string[];
  /**
   * Ordered list of claim paths to resolve the username
   * @example ["preferred_username","email","sub"]
   */
  usernameClaimPaths?: string[];
  /**
   * Ordered list of claim paths to resolve the email
   * @example ["email","emails[0].value","upn"]
   */
  emailClaimPaths?: string[];
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
  type: ResourceType;
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
  documentationType?: DocumentationType;
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
   * Custom metadata key-value pairs configured for this resource
   * @example {"location":"lab-1","template":"door-access"}
   */
  metadata?: Record<string, string>;
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

export interface FormField {
  /** The ID of the form field */
  id: number;
  /** The ID of the form that the field belongs to */
  formId: number;
  /** The form that the field belongs to */
  form: Form;
  /** The name of the form field */
  name: string;
  /** The type of the form field */
  type: FormFieldType;
  /** Whether the form field is required */
  isRequired: boolean;
  /** The description of the form field */
  description: string;
  /** The options of the form field */
  options: object;
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
  type: ResourceType;
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
  documentationType?: DocumentationType;
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
   * Custom metadata key-value pairs configured for this resource
   * @example {"location":"lab-1","template":"door-access"}
   */
  metadata?: Record<string, string>;
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
  /**
   * When the resource was deleted
   * @format date-time
   */
  deletedAt: string | null;
  /** The groups the resource belongs to */
  groups: ResourceGroup[];
  /** The forms attached to the resource */
  forms: Form[];
}

export interface ProjectMember {
  /** Unique identifier of the project member */
  id: number;
  /** Project ID the member belongs to */
  projectId: number;
  /** Project the member belongs to */
  project: Project;
  /** User ID of the member */
  userId: number;
  /** User that belongs to the project */
  user: User;
  /** Role of the member within the project */
  role: ProjectMemberRole;
  /**
   * When the membership started
   * @format date-time
   */
  joinedAt: string;
}

export interface ProjectInvitation {
  /** Unique identifier of the project invitation */
  id: number;
  /** Project ID for which the invitation was created */
  projectId: number;
  /** Project for which the invitation was created */
  project: Project;
  /** User ID that created the invitation */
  inviterId: number;
  /** Inviter user */
  inviter: User;
  /** User ID that is being invited */
  invitedUserId: number;
  /** Invited user */
  invitedUser: User;
  /** Current status of the invitation */
  status: ProjectInvitationStatus;
  /** Role that should be granted upon acceptance */
  requestedRole: ProjectMemberRole;
  /**
   * Timestamp when the invitation was responded to (accept/decline/cancel)
   * @format date-time
   */
  respondedAt?: string;
  /**
   * When the invitation was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the invitation was last updated
   * @format date-time
   */
  updatedAt: string;
}

export interface Project {
  /** The ID of the project */
  id: number;
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
  /** The ID of the user that owns the project */
  owner: User;
  /** The name of the project */
  name: string;
  /** The description of the project */
  description: string;
  /** The logo of the project */
  logo: string;
  /** Members that have access to the project */
  members: ProjectMember[];
  /** Pending invitations for the project */
  invitations: ProjectInvitation[];
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
  usageAction: ResourceUsageAction;
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
  /**
   * The ID of the project this usage session belongs to
   * @example 1
   */
  projectId?: number;
  /** The project this usage session belongs to */
  project?: Project;
  /** The form submissions that belong to this resource usage */
  formSubmissions: FormSubmission[];
  /** Whether the resource usage is finalized */
  isFinalized: boolean;
}

export interface FormSubmission {
  /** The ID of the form submission */
  id: number;
  /** The ID of the form that the submission belongs to */
  formId: number;
  /** The form that the submission belongs to */
  form: Form;
  /** The data of the form submission */
  data: object;
  /**
   * The date and time the submission was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time the submission was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The ID of the user that submitted the form */
  userId: number;
  /** The user that submitted the form */
  user: User;
  /** The ID of the resource usage that the submission belongs to */
  resourceUsageId: number;
  /** The resource usage that the submission belongs to */
  resourceUsage: ResourceUsage;
  /** The action that triggered the submission */
  action: "start" | "takeover" | "end";
}

export interface Form {
  /** The ID of the form */
  id: number;
  /**
   * The date and time the form was created
   * @format date-time
   */
  createdAt: string;
  /**
   * The date and time the form was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The name of the form */
  name: string;
  /** Whether the form is required on resource usage start */
  isRequiredOnResourceUsageStart: boolean;
  /** Whether the form is required on resource usage take over */
  isRequiredOnResourceUsageTakeOver: boolean;
  /** Whether the form is required on resource usage end */
  isRequiredOnResourceUsageEnd: boolean;
  /** The fields of the form */
  fields: FormField[];
  /** The submissions of the form */
  submissions: FormSubmission[];
  /** The ID of the resource that the form belongs to */
  resourceId: number;
  /** The resource that the form belongs to */
  resource: Resource;
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
  type?: ResourceType;
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
  documentationType?: DocumentationType;
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
   * Custom metadata key-value pairs configured for this resource
   * @example {"location":"lab-1","template":"door-access"}
   */
  metadata?: Record<string, string>;
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
   * Default QoS level for publish operations (0, 1, or 2)
   * @example 0
   */
  defaultPublishQos: number;
  /**
   * Default retain flag for publish operations
   * @example false
   */
  defaultPublishRetain: boolean;
  /**
   * Default QoS level for subscribe operations (0, 1, or 2)
   * @example 0
   */
  defaultSubscribeQos: number;
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
  /**
   * Default publish QoS (0, 1, or 2)
   * @example 0
   */
  defaultPublishQos?: number;
  /**
   * Default publish retain flag
   * @example false
   */
  defaultPublishRetain?: boolean;
  /**
   * Default subscribe QoS (0, 1, or 2)
   * @example 0
   */
  defaultSubscribeQos?: number;
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
  /**
   * Default publish QoS (0, 1, or 2)
   * @example 0
   */
  defaultPublishQos?: number;
  /**
   * Default publish retain flag
   * @example false
   */
  defaultPublishRetain?: boolean;
  /**
   * Default subscribe QoS (0, 1, or 2)
   * @example 0
   */
  defaultSubscribeQos?: number;
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
  action: IntroductionHistoryAction;
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

export interface FormSubmissionFieldAnswerDto {
  /**
   * Field identifier
   * @example 101
   */
  fieldId: number;
  /** Submitted value */
  value: string | number | boolean;
}

export interface FormSubmissionRequestDto {
  /**
   * Form identifier
   * @example 12
   */
  formId: number;
  answers: FormSubmissionFieldAnswerDto[];
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
  /**
   * The project to assign this usage to
   * @example 35
   */
  projectId?: number;
  /** Form submissions required for this action */
  formSubmissions?: FormSubmissionRequestDto[];
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
  /** Form submissions associated with ending the usage session */
  formSubmissions?: FormSubmissionRequestDto[];
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

export interface BalanceDto {
  /** The balance of the user */
  value: number;
}

export interface BillingTransactionItem {
  /**
   * The unique identifier of the billing transaction item
   * @example 1
   */
  id: number;
  /**
   * The ID of the billing transaction
   * @example 1
   */
  billingTransactionId: number;
  /** The billing transaction */
  billingTransaction: BillingTransaction;
  /**
   * The name of the billing transaction item
   * @example "Credit top-up"
   */
  name: string;
  /**
   * The description of the billing transaction item
   * @example "Credit top-up for user 1"
   */
  description: string | null;
  /**
   * The external reference of the billing transaction item
   * @example "1234567890"
   */
  externalReference: string | null;
  /**
   * The unit price of the billing transaction item
   * @example "100"
   */
  unitPrice: number;
  /**
   * The quantity of the billing transaction item
   * @example "100"
   */
  quantity: number;
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
  /** The external reference e.g. sumup transaction ID */
  externalReference: string;
  /** The status of the billing transaction */
  status: BillingTransactionStatus;
  /** The custom items of the billing transaction */
  items: BillingTransactionItem[];
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

export interface ResourceBillingConfigurationItemDto {
  /** the name of the item */
  name: string;
  /** the unit price of the item */
  unitPrice: number;
  /** the quantity of the item */
  quantity: number;
}

export interface ResourceBillingConfigurationDto {
  /** the configuration */
  configuration: ResourceBillingConfiguration;
  /** the additional items */
  additionalItems: ResourceBillingConfigurationItemDto[];
  /** whether billing is enabled */
  isBillingEnabled: boolean;
}

export interface UpdateResourceBillingConfigurationDto {
  /**
   * The credit cost per usage
   * @example 5
   */
  creditsPerUsage?: number | null;
  /**
   * The credit cost per minute
   * @example 0.2
   */
  creditsPerMinute?: number | null;
}

export interface SetSumUpApiKeyDto {
  /**
   * The API key for the SumUp API
   * @example "1234567890"
   */
  apiKey: string;
}

export interface SetBillingConfigurationDto {
  /**
   * The currency to use
   * @example "EUR"
   */
  currency: Currency;
}

export interface BillingConfigurationDto {
  /**
   * The currency to use
   * @example "EUR"
   */
  currency: Currency;
  /**
   * The minor unit of the currency
   * @example 2
   */
  minorUnit: number;
}

export interface SumUpConfigurationDto {
  /**
   * Whether the SumUp configuration is enabled
   * @example true
   */
  enabled: boolean;
}

export interface SumUpReaderDevice {
  /** @example "1234567890" */
  identifier: string;
  /** @example "solo" */
  model: SumUpReaderModel;
}

export interface SumUpReaderDto {
  /** @example "1234567890" */
  id: string;
  /** @example "Reader 1" */
  name: string;
  /** @example "active" */
  status: SumUpReaderStatus;
  device: SumUpReaderDevice;
  /** @example {} */
  meta?: Record<string, any>;
  /**
   * @format date-time
   * @example "2021-01-01T00:00:00.000Z"
   */
  created_at: string;
  /**
   * @format date-time
   * @example "2021-01-01T00:00:00.000Z"
   */
  updated_at: string;
}

export interface PairSumUpReaderDto {
  /** @example "1234567890" */
  pairingCode: string;
  /** @example "Reader 1" */
  name: string;
}

export interface SumupTopUpDto {
  /**
   * @min 1
   * @example 100
   */
  amount: number;
  /** @example "1234567890" */
  readerId: string;
}

export interface Payload {
  /**
   * The ID of the transaction
   * @example "1234567890"
   */
  client_transaction_id: string;
  /**
   * The merchant code
   * @example "MPMGEBZF"
   */
  merchant_code: string;
  /**
   * The status of the transaction
   * @example "successful"
   */
  status: SumupTransactionStatus;
  /**
   * The ID of the transaction
   * @example "8f0973dc-60df-4a8c-80ee-a06103c1d10e"
   */
  transaction_id: string;
}

export interface SumupTransactionCallbackDto {
  /**
   * The ID of the transaction
   * @example "1234567890"
   */
  id: string;
  /**
   * The type of the transaction
   * @example "solo.transaction.updated"
   */
  event_type: SumupTransactionEventType;
  /**
   * The payload of the transaction
   * @example {"client_transaction_id":"1234567890","merchant_code":"MPMGEBZF","status":"successful","transaction_id":"8f0973dc-60df-4a8c-80ee-a06103c1d10e"}
   */
  payload: Payload;
  /**
   * The timestamp of the transaction
   * @format date-time
   * @example "2025-09-13T21:31:56.984208Z"
   */
  timestamp: string;
}

export interface RefundTransactionDto {
  /** @example 100 */
  amount: number;
}

export interface ResourceFlowNodeSchemaDto {
  /** The name of the node type */
  type: ResourceFlowNodeType;
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
  type: ResourceFlowNodeType;
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
  type: ResourceFlowLogType;
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
  type: ResourceFlowNodeType;
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

export interface ProjectAccessInfoDto {
  /** Whether the authenticated user owns the project */
  isOwner: boolean;
  /** Role of the authenticated user inside the project when they are a member */
  role?: ProjectMemberRole | null;
  /** Whether the authenticated user can manage the project */
  canManageProject: boolean;
}

export interface ProjectWithAccessDto {
  /** The ID of the project */
  id: number;
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
  /** The ID of the user that owns the project */
  owner: User;
  /** The name of the project */
  name: string;
  /** The description of the project */
  description: string;
  /** The logo of the project */
  logo: string;
  /** Members that have access to the project */
  members: ProjectMember[];
  /** Pending invitations for the project */
  invitations: ProjectInvitation[];
  access: ProjectAccessInfoDto;
}

export interface FindManyProjectsResponseDto {
  data: ProjectWithAccessDto[];
  total: number;
  page: number;
  limit: number;
  nextPage: number;
}

export interface CreateProjectDto {
  /**
   * The name of the project
   * @example "Project 1"
   */
  name: string;
  /**
   * The description of the project
   * @example "This is a project"
   */
  description?: string;
  /**
   * Project logo image file
   * @format binary
   */
  logo?: File;
}

export interface UpdateProjectDto {
  /**
   * The name of the project
   * @example "Project 1"
   */
  name: string;
  /**
   * The description of the project
   * @example "This is a project"
   */
  description?: string;
  /**
   * Project logo image file
   * @format binary
   */
  logo?: File;
  /**
   * Whether the project logo should be deleted
   * @default false
   */
  deleteLogo?: boolean;
}

export interface ProjectUsageHistoryResponseDto {
  data: ResourceUsage[];
  total: number;
  page: number;
  limit: number;
  nextPage?: number;
}

export interface ProjectUsageSummaryDto {
  /** Total completed usage sessions in the range */
  totalSessions: number;
  /** Total minutes spent across sessions (rounded up per session) */
  totalMinutes: number;
  /** Total credits spent (positive value using currency minor unit) */
  totalSpend: number;
  /**
   * Currency of the spend totals
   * @example "EUR"
   */
  currency: string;
  /**
   * Minor unit exponent for the currency
   * @example 2
   */
  minorUnit: number;
}

export interface ProjectUsageTimeSeriesPointDto {
  /** ISO date (yyyy-MM-dd) */
  date: string;
  /** Number of sessions that started on this day */
  sessions: number;
  /** Total minutes of the sessions on this day */
  minutes: number;
  /** Total spend (credits) on this day */
  spend: number;
}

export interface ProjectUsageTopResourceDto {
  resourceId: number;
  resourceName: string;
  sessions: number;
  minutes: number;
  spend: number;
}

export interface ProjectUsageStatsDto {
  summary: ProjectUsageSummaryDto;
  timeSeries: ProjectUsageTimeSeriesPointDto[];
  topResources: ProjectUsageTopResourceDto[];
}

export interface ProjectMembersResponseDto {
  owner: User;
  members: ProjectMember[];
}

export interface CreateProjectInvitationDto {
  /** ID of the existing user to invite */
  invitedUserId: number;
  /**
   * Role the invited user should receive upon acceptance
   * @default "viewer"
   */
  role?: ProjectMemberRole;
}

export interface FormFieldResponseDto {
  /**
   * Field display name
   * @example "Project name"
   */
  name: string;
  /**
   * Field type
   * @example "text"
   */
  type: FormFieldType;
  /**
   * Whether the field is required
   * @example true
   */
  isRequired: boolean;
  /** Optional description shown below the label */
  description?: string;
  /** Arbitrary options payload (e.g. select choices) */
  options?: Record<string, any> | string[];
  /**
   * Field identifier
   * @example 42
   */
  id: number;
}

export interface FormResponseDto {
  /**
   * Form identifier
   * @example 12
   */
  id: number;
  /**
   * Creation timestamp
   * @format date-time
   */
  createdAt: string;
  /**
   * Last update timestamp
   * @format date-time
   */
  updatedAt: string;
  /**
   * Form name
   * @example "Machine safety checklist"
   */
  name: string;
  /** Whether required before starting a usage session */
  isRequiredOnResourceUsageStart: boolean;
  /** Whether required before taking over a usage session */
  isRequiredOnResourceUsageTakeOver: boolean;
  /** Whether required when ending a usage session */
  isRequiredOnResourceUsageEnd: boolean;
  /**
   * Owning resource identifier
   * @example 5
   */
  resourceId: number;
  fields: FormFieldResponseDto[];
}

export interface CreateFormFieldDto {
  /**
   * Field display name
   * @example "Project name"
   */
  name: string;
  /**
   * Field type
   * @example "text"
   */
  type: FormFieldType;
  /**
   * Whether the field is required
   * @example true
   */
  isRequired: boolean;
  /** Optional description shown below the label */
  description?: string;
  /** Arbitrary options payload (e.g. select choices) */
  options?: Record<string, any> | string[];
}

export interface CreateFormDto {
  /**
   * Form name
   * @example "Machine start checklist"
   */
  name: string;
  /**
   * Require before resource usage start
   * @default false
   */
  isRequiredOnResourceUsageStart: boolean;
  /**
   * Require before taking over an active usage
   * @default false
   */
  isRequiredOnResourceUsageTakeOver: boolean;
  /**
   * Require when ending a usage session
   * @default false
   */
  isRequiredOnResourceUsageEnd: boolean;
  fields: CreateFormFieldDto[];
}

export interface UpdateFormFieldDto {
  /**
   * Field display name
   * @example "Project name"
   */
  name: string;
  /**
   * Field type
   * @example "text"
   */
  type: FormFieldType;
  /**
   * Whether the field is required
   * @example true
   */
  isRequired: boolean;
  /** Optional description shown below the label */
  description?: string;
  /** Arbitrary options payload (e.g. select choices) */
  options?: Record<string, any> | string[];
  /** Existing field identifier */
  id?: number;
}

export interface UpdateFormDto {
  /**
   * Form name
   * @example "Machine start checklist"
   */
  name: string;
  /**
   * Require before resource usage start
   * @default false
   */
  isRequiredOnResourceUsageStart: boolean;
  /**
   * Require before taking over an active usage
   * @default false
   */
  isRequiredOnResourceUsageTakeOver: boolean;
  /**
   * Require when ending a usage session
   * @default false
   */
  isRequiredOnResourceUsageEnd: boolean;
  fields: UpdateFormFieldDto[];
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

export interface AttractapCapabilities {
  /**
   * Whether the reader can choose from many linked resources or can only handle one
   * @default true
   * @example true
   */
  resourceSelection: boolean;
  /**
   * Whether the reader has interface options for triggering resource actions, if not a actions is triggered immediately upon scanning a nfc card
   * @default true
   * @example true
   */
  resourceActionSelection: boolean;
  /**
   * Whether the reader can enroll new cards
   * @default true
   * @example true
   */
  cardEnrollment: boolean;
}

export interface AttractapFirmwareVersion {
  /**
   * The name of the firmware
   * @example "Attractap"
   */
  name: string | null;
  /**
   * The variant of the firmware
   * @example "eth"
   */
  variant: string | null;
  /**
   * The version of the firmware
   * @example "1.0.0"
   */
  version: string | null;
  /** The capabilities of the reader */
  capabilities: AttractapCapabilities;
}

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
  /**
   * The ESP chip type (esp32, esp32s2, esp32s3, esp32c3)
   * @example "esp32s3"
   */
  chip: string;
  /**
   * The flash mode for programming (qio, qout, dio, dout)
   * @example "dio"
   */
  flashMode: string;
  /**
   * The flash frequency for programming (80m, 40m, 26m, 20m)
   * @example "80m"
   */
  flashFreq: string;
  /**
   * The flash size (4MB, 8MB, 16MB, etc.)
   * @example "16MB"
   */
  flashSize: string;
}

export interface InfoData {
  /** @example "Attraccess API" */
  name?: string;
  /** @example "ok" */
  status?: string;
}

export type RebootHostData = any;

export type ShutdownHostData = any;

export type GetLocalSignupDomainWhitelistData = string[];

export type SetLocalSignupDomainWhitelistPayload = string[];

export type SetLocalSignupDomainWhitelistData = any;

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

export type InviteUserData = User;

export type InviteUsersFromCsvData = User[];

export type InviteUsersFromCsvError = CsvInviteErrorResponseDto;

export type IsLocalSignupEnabledData = BooleanDto;

export interface VerifyEmailData {
  /** @example "Email verified successfully" */
  message?: string;
}

export type AcceptInvitationData = User;

export type RequestPasswordResetData = any;

export type ChangePasswordViaResetTokenData = any;

export type GetCurrentData = User;

export type ChangeMyUsernameData = User;

export type GetOneUserByIdData = User;

export type GetOneUserByIdError = UserNotFoundException;

export type UpdatePermissionsData = User;

export type GetPermissionsData = SystemPermissions;

export type BulkUpdatePermissionsData = User[];

export interface GetAllWithPermissionParams {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Filter users by permission */
  permission?: PermissionFilter;
}

export type GetAllWithPermissionData = PaginatedUsersResponseDto;

export interface SetUserPasswordData {
  /** @example "Password updated successfully" */
  message?: string;
}

export type ChangeUserUsernameData = User;

export type ChangeUserBillingFactorData = User;

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
  /** Whether the account has been linked to the SSO identity */
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

export type GetBillingTransactionData = BillingTransaction;

export type GetResourceBillingConfigurationData =
  ResourceBillingConfigurationDto;

export type UpdateResourceBillingConfigurationData =
  ResourceBillingConfiguration;

export type SetSumUpApiKeyData = string;

export type SetBillingConfigurationData = BillingConfigurationDto;

export type GetBillingConfigurationData = BillingConfigurationDto;

export type GetSumUpConfigurationData = SumUpConfigurationDto;

export type GetSumUpReadersData = SumUpReaderDto[];

export type PairSumUpReaderData = SumUpReaderDto;

export type TopUpWithSumUpReaderData = BillingTransaction;

export type SumUpTopUpCallbackData = any;

export type RefundTransactionData = BillingTransaction;

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

export interface FindManyProjectsParams {
  /**
   * The page number to retrieve
   * @example 1
   */
  page?: number;
  /**
   * The number of items per page to retrieve
   * @example 10
   */
  limit?: number;
}

export type FindManyProjectsData = FindManyProjectsResponseDto;

export type CreateProjectData = ProjectWithAccessDto;

export type FindOneProjectData = ProjectWithAccessDto;

export type DeleteOneProjectData = any;

export type UpdateProjectData = ProjectWithAccessDto;

export interface GetProjectUsageHistoryParams {
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
   * Filter history to entries starting after this date (inclusive)
   * @format date-time
   */
  startDate?: string;
  /**
   * Filter history to entries starting before this date (inclusive)
   * @format date-time
   */
  endDate?: string;
  id: number;
}

export type GetProjectUsageHistoryData = ProjectUsageHistoryResponseDto;

export interface GetProjectUsageStatsParams {
  /**
   * Calculate statistics starting from this date (inclusive)
   * @format date-time
   */
  startDate?: string;
  /**
   * Calculate statistics up to this date (inclusive)
   * @format date-time
   */
  endDate?: string;
  id: number;
}

export type GetProjectUsageStatsData = ProjectUsageStatsDto;

export type ListProjectMembersData = ProjectMembersResponseDto;

export type RemoveProjectMemberData = any;

export type ListProjectInvitationsData = ProjectInvitation[];

export type CreateProjectInvitationData = ProjectInvitation;

export type ResendProjectInvitationData = ProjectInvitation;

export type CancelProjectInvitationData = ProjectInvitation;

export type ListMyProjectInvitationsData = ProjectInvitation[];

export type AcceptProjectInvitationData = ProjectInvitation;

export type DeclineProjectInvitationData = ProjectInvitation;

export type ResourceFormsListData = FormResponseDto[];

export type ResourceFormsCreateData = FormResponseDto;

export interface ResourceFormsGetRequirementsParams {
  /** Usage action the forms are required for */
  action: "start" | "takeover" | "end";
  resourceId: number;
}

export type ResourceFormsGetRequirementsData = FormResponseDto[];

export type ResourceFormsGetOneData = FormResponseDto;

export type ResourceFormsUpdateData = FormResponseDto;

export type ResourceFormsDeleteData = any;

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

export type DownloadFirmwareBinaryData = string;

export type GetFirmwareBinaryData = string;

export interface GetResourceUsageHoursInDateRangeParams {
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

export type GetResourceUsageHoursInDateRangeData = ResourceUsage[];

export interface GetBillingTransactionsInDateRangeParams {
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

export type GetBillingTransactionsInDateRangeData = BillingTransaction[];

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

  /**
   * No description
   * @tags System
   * @name RebootHost
   * @summary Reboot the host machine (only for balena devices)
   * @request POST:/api/balena/device/reboot
   * @secure
   */
  export namespace RebootHost {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = RebootHostData;
  }

  /**
   * No description
   * @tags System
   * @name ShutdownHost
   * @summary Shutdown the host machine (only for balena devices)
   * @request POST:/api/balena/device/shutdown
   * @secure
   */
  export namespace ShutdownHost {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ShutdownHostData;
  }
}

export namespace Users {
  /**
   * No description
   * @tags Users
   * @name GetLocalSignupDomainWhitelist
   * @summary Get the local signup domain whitelist
   * @request GET:/api/users/local-signup-domain-whitelist
   * @secure
   */
  export namespace GetLocalSignupDomainWhitelist {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetLocalSignupDomainWhitelistData;
  }

  /**
   * No description
   * @tags Users
   * @name SetLocalSignupDomainWhitelist
   * @summary Set the local signup domain whitelist
   * @request POST:/api/users/local-signup-domain-whitelist
   * @secure
   */
  export namespace SetLocalSignupDomainWhitelist {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = SetLocalSignupDomainWhitelistPayload;
    export type RequestHeaders = {};
    export type ResponseBody = SetLocalSignupDomainWhitelistData;
  }

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
   * @name InviteUser
   * @summary Invite a new user
   * @request POST:/api/users/invite
   * @secure
   */
  export namespace InviteUser {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = InviteUserDto;
    export type RequestHeaders = {};
    export type ResponseBody = InviteUserData;
  }

  /**
   * No description
   * @tags Users
   * @name InviteUsersFromCsv
   * @summary Invite multiple users from a CSV file
   * @request POST:/api/users/invite-csv
   * @secure
   */
  export namespace InviteUsersFromCsv {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CsvInviteUploadDto;
    export type RequestHeaders = {};
    export type ResponseBody = InviteUsersFromCsvData;
  }

  /**
   * No description
   * @tags Users
   * @name IsLocalSignupEnabled
   * @summary Check if local signup is enabled
   * @request GET:/api/users/local-signup-enabled
   */
  export namespace IsLocalSignupEnabled {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = IsLocalSignupEnabledData;
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
   * @name AcceptInvitation
   * @summary Accept a user invitation
   * @request POST:/api/users/accept-invitation
   */
  export namespace AcceptInvitation {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = AcceptInvitationDto;
    export type RequestHeaders = {};
    export type ResponseBody = AcceptInvitationData;
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
      permission?: PermissionFilter;
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

  /**
   * No description
   * @tags Users
   * @name ChangeUserBillingFactor
   * @summary Change a user's billing factor
   * @request PATCH:/api/users/{id}/billing-factor
   * @secure
   */
  export namespace ChangeUserBillingFactor {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = ChangeBillingFactorDto;
    export type RequestHeaders = {};
    export type ResponseBody = ChangeUserBillingFactorData;
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
   * @summary Link an account to an SSO identity via a signed token
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
      type: EmailTemplateType;
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
      type: EmailTemplateType;
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
   * @name GetBillingTransaction
   * @summary Get a billing transaction for a user
   * @request GET:/api/users/{userId}/billing/transactions/{transactionId}
   * @secure
   */
  export namespace GetBillingTransaction {
    export type RequestParams = {
      transactionId: number;
      userId: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetBillingTransactionData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetResourceBillingConfiguration
   * @summary Get the billing configuration for a resource
   * @request GET:/api/resources/{resourceId}/billing/configuration
   * @secure
   */
  export namespace GetResourceBillingConfiguration {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetResourceBillingConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name UpdateResourceBillingConfiguration
   * @summary Update the billing configuration for a resource
   * @request POST:/api/resources/{resourceId}/billing/configuration
   * @secure
   */
  export namespace UpdateResourceBillingConfiguration {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateResourceBillingConfigurationDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateResourceBillingConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name SetSumUpApiKey
   * @summary Set the SumUp configuration
   * @request POST:/api/billing/sumup/configuration/api-key
   * @secure
   */
  export namespace SetSumUpApiKey {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = SetSumUpApiKeyDto;
    export type RequestHeaders = {};
    export type ResponseBody = SetSumUpApiKeyData;
  }

  /**
   * No description
   * @tags Billing
   * @name SetBillingConfiguration
   * @summary Set the billing configuration
   * @request POST:/api/billing/configuration
   * @secure
   */
  export namespace SetBillingConfiguration {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = SetBillingConfigurationDto;
    export type RequestHeaders = {};
    export type ResponseBody = SetBillingConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetBillingConfiguration
   * @summary Get the billing configuration
   * @request GET:/api/billing/configuration
   * @secure
   */
  export namespace GetBillingConfiguration {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetBillingConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetSumUpConfiguration
   * @summary Get the SumUp configuration
   * @request GET:/api/billing/sumup/configuration
   * @secure
   */
  export namespace GetSumUpConfiguration {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetSumUpConfigurationData;
  }

  /**
   * No description
   * @tags Billing
   * @name GetSumUpReaders
   * @summary Get the linked SumUp readers
   * @request GET:/api/billing/sumup/readers
   * @secure
   */
  export namespace GetSumUpReaders {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetSumUpReadersData;
  }

  /**
   * No description
   * @tags Billing
   * @name PairSumUpReader
   * @summary Pair a SumUp reader
   * @request POST:/api/billing/sumup/readers/pair
   * @secure
   */
  export namespace PairSumUpReader {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = PairSumUpReaderDto;
    export type RequestHeaders = {};
    export type ResponseBody = PairSumUpReaderData;
  }

  /**
   * No description
   * @tags Billing
   * @name RemoveSumUpReader
   * @summary Remove a SumUp reader
   * @request DELETE:/api/billing/sumup/readers/{readerId}
   * @secure
   */
  export namespace RemoveSumUpReader {
    export type RequestParams = {
      readerId: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = any;
  }

  /**
   * No description
   * @tags Billing
   * @name TopUpWithSumUpReader
   * @summary Top up using a SumUp reader
   * @request POST:/api/billing/top-up/sumup
   * @secure
   */
  export namespace TopUpWithSumUpReader {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = SumupTopUpDto;
    export type RequestHeaders = {};
    export type ResponseBody = TopUpWithSumUpReaderData;
  }

  /**
   * No description
   * @tags Billing
   * @name SumUpTopUpCallback
   * @summary Callback from SumUp
   * @request POST:/api/billing/top-up/sumup/callback
   */
  export namespace SumUpTopUpCallback {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = SumupTransactionCallbackDto;
    export type RequestHeaders = {};
    export type ResponseBody = SumUpTopUpCallbackData;
  }

  /**
   * No description
   * @tags Billing
   * @name BillingControllerStreamEvents
   * @request GET:/api/billing/transactions/live
   * @secure
   */
  export namespace BillingControllerStreamEvents {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = any;
  }

  /**
   * No description
   * @tags Billing
   * @name RefundTransaction
   * @summary Refund a billing transaction
   * @request POST:/api/billing/transactions/{transactionId}/refund
   * @secure
   */
  export namespace RefundTransaction {
    export type RequestParams = {
      transactionId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = RefundTransactionDto;
    export type RequestHeaders = {};
    export type ResponseBody = RefundTransactionData;
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

export namespace Projects {
  /**
   * No description
   * @tags Projects
   * @name FindManyProjects
   * @summary Find many projects
   * @request GET:/api/projects
   * @secure
   */
  export namespace FindManyProjects {
    export type RequestParams = {};
    export type RequestQuery = {
      /**
       * The page number to retrieve
       * @example 1
       */
      page?: number;
      /**
       * The number of items per page to retrieve
       * @example 10
       */
      limit?: number;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = FindManyProjectsData;
  }

  /**
   * No description
   * @tags Projects
   * @name CreateProject
   * @summary Create a project
   * @request POST:/api/projects
   * @secure
   */
  export namespace CreateProject {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateProjectDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateProjectData;
  }

  /**
   * No description
   * @tags Projects
   * @name FindOneProject
   * @summary Get one project
   * @request GET:/api/projects/{id}
   * @secure
   */
  export namespace FindOneProject {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = FindOneProjectData;
  }

  /**
   * No description
   * @tags Projects
   * @name DeleteOneProject
   * @summary Delete a project
   * @request DELETE:/api/projects/{id}
   * @secure
   */
  export namespace DeleteOneProject {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeleteOneProjectData;
  }

  /**
   * No description
   * @tags Projects
   * @name UpdateProject
   * @summary Update a project
   * @request PUT:/api/projects/{id}
   * @secure
   */
  export namespace UpdateProject {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateProjectDto;
    export type RequestHeaders = {};
    export type ResponseBody = UpdateProjectData;
  }

  /**
   * No description
   * @tags Projects
   * @name GetProjectUsageHistory
   * @summary Get usage history for a project
   * @request GET:/api/projects/{id}/usage/history
   * @secure
   */
  export namespace GetProjectUsageHistory {
    export type RequestParams = {
      id: number;
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
       * Filter history to entries starting after this date (inclusive)
       * @format date-time
       */
      startDate?: string;
      /**
       * Filter history to entries starting before this date (inclusive)
       * @format date-time
       */
      endDate?: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetProjectUsageHistoryData;
  }

  /**
   * No description
   * @tags Projects
   * @name GetProjectUsageStats
   * @summary Get aggregated usage statistics for a project
   * @request GET:/api/projects/{id}/usage/stats
   * @secure
   */
  export namespace GetProjectUsageStats {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {
      /**
       * Calculate statistics starting from this date (inclusive)
       * @format date-time
       */
      startDate?: string;
      /**
       * Calculate statistics up to this date (inclusive)
       * @format date-time
       */
      endDate?: string;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = GetProjectUsageStatsData;
  }

  /**
   * No description
   * @tags Projects
   * @name ListProjectMembers
   * @summary List project members
   * @request GET:/api/projects/{id}/members
   * @secure
   */
  export namespace ListProjectMembers {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ListProjectMembersData;
  }

  /**
   * No description
   * @tags Projects
   * @name RemoveProjectMember
   * @summary Remove a project member
   * @request DELETE:/api/projects/{id}/members/{memberId}
   * @secure
   */
  export namespace RemoveProjectMember {
    export type RequestParams = {
      id: number;
      memberId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = RemoveProjectMemberData;
  }

  /**
   * No description
   * @tags Projects
   * @name ListProjectInvitations
   * @summary List project invitations
   * @request GET:/api/projects/{id}/invitations
   * @secure
   */
  export namespace ListProjectInvitations {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ListProjectInvitationsData;
  }

  /**
   * No description
   * @tags Projects
   * @name CreateProjectInvitation
   * @summary Create a project invitation
   * @request POST:/api/projects/{id}/invitations
   * @secure
   */
  export namespace CreateProjectInvitation {
    export type RequestParams = {
      id: number;
    };
    export type RequestQuery = {};
    export type RequestBody = CreateProjectInvitationDto;
    export type RequestHeaders = {};
    export type ResponseBody = CreateProjectInvitationData;
  }

  /**
   * No description
   * @tags Projects
   * @name ResendProjectInvitation
   * @summary Resend a project invitation
   * @request POST:/api/projects/{id}/invitations/{invitationId}/resend
   * @secure
   */
  export namespace ResendProjectInvitation {
    export type RequestParams = {
      id: number;
      invitationId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResendProjectInvitationData;
  }

  /**
   * No description
   * @tags Projects
   * @name CancelProjectInvitation
   * @summary Cancel a project invitation
   * @request DELETE:/api/projects/{id}/invitations/{invitationId}
   * @secure
   */
  export namespace CancelProjectInvitation {
    export type RequestParams = {
      id: number;
      invitationId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = CancelProjectInvitationData;
  }
}

export namespace ProjectInvitations {
  /**
   * No description
   * @tags Project Invitations
   * @name ListMyProjectInvitations
   * @summary List pending project invitations for the authenticated user
   * @request GET:/api/project-invitations
   * @secure
   */
  export namespace ListMyProjectInvitations {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ListMyProjectInvitationsData;
  }

  /**
   * No description
   * @tags Project Invitations
   * @name AcceptProjectInvitation
   * @summary Accept a project invitation
   * @request POST:/api/project-invitations/{invitationId}/accept
   * @secure
   */
  export namespace AcceptProjectInvitation {
    export type RequestParams = {
      invitationId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = AcceptProjectInvitationData;
  }

  /**
   * No description
   * @tags Project Invitations
   * @name DeclineProjectInvitation
   * @summary Decline a project invitation
   * @request POST:/api/project-invitations/{invitationId}/decline
   * @secure
   */
  export namespace DeclineProjectInvitation {
    export type RequestParams = {
      invitationId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DeclineProjectInvitationData;
  }
}

export namespace ResourceForms {
  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsList
   * @summary List forms for a resource
   * @request GET:/api/resources/{resourceId}/forms
   * @secure
   */
  export namespace ResourceFormsList {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsListData;
  }

  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsCreate
   * @summary Create a form
   * @request POST:/api/resources/{resourceId}/forms
   * @secure
   */
  export namespace ResourceFormsCreate {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = CreateFormDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsCreateData;
  }

  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsGetRequirements
   * @summary Get required forms for a resource action
   * @request GET:/api/resources/{resourceId}/forms/requirements
   * @secure
   */
  export namespace ResourceFormsGetRequirements {
    export type RequestParams = {
      resourceId: number;
    };
    export type RequestQuery = {
      /** Usage action the forms are required for */
      action: "start" | "takeover" | "end";
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsGetRequirementsData;
  }

  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsGetOne
   * @summary Get a form by id
   * @request GET:/api/resources/{resourceId}/forms/{formId}
   * @secure
   */
  export namespace ResourceFormsGetOne {
    export type RequestParams = {
      resourceId: number;
      formId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsGetOneData;
  }

  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsUpdate
   * @summary Update a form
   * @request PUT:/api/resources/{resourceId}/forms/{formId}
   * @secure
   */
  export namespace ResourceFormsUpdate {
    export type RequestParams = {
      resourceId: number;
      formId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = UpdateFormDto;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsUpdateData;
  }

  /**
   * No description
   * @tags Resource Forms
   * @name ResourceFormsDelete
   * @summary Delete a form
   * @request DELETE:/api/resources/{resourceId}/forms/{formId}
   * @secure
   */
  export namespace ResourceFormsDelete {
    export type RequestParams = {
      resourceId: number;
      formId: number;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = ResourceFormsDeleteData;
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
   * @name DownloadFirmwareBinary
   * @summary Download OTA firmware by name and variant
   * @request GET:/api/attractap/firmwares/{firmwareName}/variants/{variantName}
   */
  export namespace DownloadFirmwareBinary {
    export type RequestParams = {
      firmwareName: string;
      variantName: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = DownloadFirmwareBinaryData;
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
   * @name GetResourceUsageHoursInDateRange
   * @summary Get the resource usage hours in the date range
   * @request GET:/api/analytics/resource-usage-hours
   * @secure
   */
  export namespace GetResourceUsageHoursInDateRange {
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
    export type ResponseBody = GetResourceUsageHoursInDateRangeData;
  }

  /**
   * No description
   * @tags Analytics
   * @name GetBillingTransactionsInDateRange
   * @summary Get the billing transactions in the date range
   * @request GET:/api/analytics/billing-transactions
   * @secure
   */
  export namespace GetBillingTransactionsInDateRange {
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
    export type ResponseBody = GetBillingTransactionsInDateRangeData;
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
 * @version 0.0.16
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

    /**
     * No description
     *
     * @tags System
     * @name RebootHost
     * @summary Reboot the host machine (only for balena devices)
     * @request POST:/api/balena/device/reboot
     * @secure
     */
    rebootHost: (params: RequestParams = {}) =>
      this.request<RebootHostData, void>({
        path: `/api/balena/device/reboot`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ShutdownHost
     * @summary Shutdown the host machine (only for balena devices)
     * @request POST:/api/balena/device/shutdown
     * @secure
     */
    shutdownHost: (params: RequestParams = {}) =>
      this.request<ShutdownHostData, void>({
        path: `/api/balena/device/shutdown`,
        method: "POST",
        secure: true,
        ...params,
      }),
  };
  users = {
    /**
     * No description
     *
     * @tags Users
     * @name GetLocalSignupDomainWhitelist
     * @summary Get the local signup domain whitelist
     * @request GET:/api/users/local-signup-domain-whitelist
     * @secure
     */
    getLocalSignupDomainWhitelist: (params: RequestParams = {}) =>
      this.request<GetLocalSignupDomainWhitelistData, void>({
        path: `/api/users/local-signup-domain-whitelist`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name SetLocalSignupDomainWhitelist
     * @summary Set the local signup domain whitelist
     * @request POST:/api/users/local-signup-domain-whitelist
     * @secure
     */
    setLocalSignupDomainWhitelist: (
      data: SetLocalSignupDomainWhitelistPayload,
      params: RequestParams = {},
    ) =>
      this.request<SetLocalSignupDomainWhitelistData, void>({
        path: `/api/users/local-signup-domain-whitelist`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

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
     * @name InviteUser
     * @summary Invite a new user
     * @request POST:/api/users/invite
     * @secure
     */
    inviteUser: (data: InviteUserDto, params: RequestParams = {}) =>
      this.request<InviteUserData, void>({
        path: `/api/users/invite`,
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
     * @name InviteUsersFromCsv
     * @summary Invite multiple users from a CSV file
     * @request POST:/api/users/invite-csv
     * @secure
     */
    inviteUsersFromCsv: (
      data: CsvInviteUploadDto,
      params: RequestParams = {},
    ) =>
      this.request<InviteUsersFromCsvData, InviteUsersFromCsvError>({
        path: `/api/users/invite-csv`,
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
     * @tags Users
     * @name IsLocalSignupEnabled
     * @summary Check if local signup is enabled
     * @request GET:/api/users/local-signup-enabled
     */
    isLocalSignupEnabled: (params: RequestParams = {}) =>
      this.request<IsLocalSignupEnabledData, any>({
        path: `/api/users/local-signup-enabled`,
        method: "GET",
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
     * @name AcceptInvitation
     * @summary Accept a user invitation
     * @request POST:/api/users/accept-invitation
     */
    acceptInvitation: (data: AcceptInvitationDto, params: RequestParams = {}) =>
      this.request<AcceptInvitationData, void>({
        path: `/api/users/accept-invitation`,
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

    /**
     * No description
     *
     * @tags Users
     * @name ChangeUserBillingFactor
     * @summary Change a user's billing factor
     * @request PATCH:/api/users/{id}/billing-factor
     * @secure
     */
    changeUserBillingFactor: (
      id: number,
      data: ChangeBillingFactorDto,
      params: RequestParams = {},
    ) =>
      this.request<ChangeUserBillingFactorData, void>({
        path: `/api/users/${id}/billing-factor`,
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
     * @summary Link an account to an SSO identity via a signed token
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
      type: EmailTemplateType,
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
      type: EmailTemplateType,
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
     * @name GetBillingTransaction
     * @summary Get a billing transaction for a user
     * @request GET:/api/users/{userId}/billing/transactions/{transactionId}
     * @secure
     */
    getBillingTransaction: (
      transactionId: number,
      userId: string,
      params: RequestParams = {},
    ) =>
      this.request<GetBillingTransactionData, void>({
        path: `/api/users/${userId}/billing/transactions/${transactionId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name GetResourceBillingConfiguration
     * @summary Get the billing configuration for a resource
     * @request GET:/api/resources/{resourceId}/billing/configuration
     * @secure
     */
    getResourceBillingConfiguration: (
      resourceId: number,
      params: RequestParams = {},
    ) =>
      this.request<GetResourceBillingConfigurationData, void>({
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
     * @name UpdateResourceBillingConfiguration
     * @summary Update the billing configuration for a resource
     * @request POST:/api/resources/{resourceId}/billing/configuration
     * @secure
     */
    updateResourceBillingConfiguration: (
      resourceId: number,
      data: UpdateResourceBillingConfigurationDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateResourceBillingConfigurationData, void>({
        path: `/api/resources/${resourceId}/billing/configuration`,
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
     * @name SetSumUpApiKey
     * @summary Set the SumUp configuration
     * @request POST:/api/billing/sumup/configuration/api-key
     * @secure
     */
    setSumUpApiKey: (data: SetSumUpApiKeyDto, params: RequestParams = {}) =>
      this.request<SetSumUpApiKeyData, void>({
        path: `/api/billing/sumup/configuration/api-key`,
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
     * @name SetBillingConfiguration
     * @summary Set the billing configuration
     * @request POST:/api/billing/configuration
     * @secure
     */
    setBillingConfiguration: (
      data: SetBillingConfigurationDto,
      params: RequestParams = {},
    ) =>
      this.request<SetBillingConfigurationData, void>({
        path: `/api/billing/configuration`,
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
     * @summary Get the billing configuration
     * @request GET:/api/billing/configuration
     * @secure
     */
    getBillingConfiguration: (params: RequestParams = {}) =>
      this.request<GetBillingConfigurationData, void>({
        path: `/api/billing/configuration`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name GetSumUpConfiguration
     * @summary Get the SumUp configuration
     * @request GET:/api/billing/sumup/configuration
     * @secure
     */
    getSumUpConfiguration: (params: RequestParams = {}) =>
      this.request<GetSumUpConfigurationData, void>({
        path: `/api/billing/sumup/configuration`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name GetSumUpReaders
     * @summary Get the linked SumUp readers
     * @request GET:/api/billing/sumup/readers
     * @secure
     */
    getSumUpReaders: (params: RequestParams = {}) =>
      this.request<GetSumUpReadersData, void>({
        path: `/api/billing/sumup/readers`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name PairSumUpReader
     * @summary Pair a SumUp reader
     * @request POST:/api/billing/sumup/readers/pair
     * @secure
     */
    pairSumUpReader: (data: PairSumUpReaderDto, params: RequestParams = {}) =>
      this.request<PairSumUpReaderData, void>({
        path: `/api/billing/sumup/readers/pair`,
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
     * @name RemoveSumUpReader
     * @summary Remove a SumUp reader
     * @request DELETE:/api/billing/sumup/readers/{readerId}
     * @secure
     */
    removeSumUpReader: (readerId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/api/billing/sumup/readers/${readerId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name TopUpWithSumUpReader
     * @summary Top up using a SumUp reader
     * @request POST:/api/billing/top-up/sumup
     * @secure
     */
    topUpWithSumUpReader: (data: SumupTopUpDto, params: RequestParams = {}) =>
      this.request<TopUpWithSumUpReaderData, void>({
        path: `/api/billing/top-up/sumup`,
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
     * @name SumUpTopUpCallback
     * @summary Callback from SumUp
     * @request POST:/api/billing/top-up/sumup/callback
     */
    sumUpTopUpCallback: (
      data: SumupTransactionCallbackDto,
      params: RequestParams = {},
    ) =>
      this.request<SumUpTopUpCallbackData, any>({
        path: `/api/billing/top-up/sumup/callback`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name BillingControllerStreamEvents
     * @request GET:/api/billing/transactions/live
     * @secure
     */
    billingControllerStreamEvents: (params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/api/billing/transactions/live`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name RefundTransaction
     * @summary Refund a billing transaction
     * @request POST:/api/billing/transactions/{transactionId}/refund
     * @secure
     */
    refundTransaction: (
      transactionId: number,
      data: RefundTransactionDto,
      params: RequestParams = {},
    ) =>
      this.request<RefundTransactionData, void>({
        path: `/api/billing/transactions/${transactionId}/refund`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
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
  projects = {
    /**
     * No description
     *
     * @tags Projects
     * @name FindManyProjects
     * @summary Find many projects
     * @request GET:/api/projects
     * @secure
     */
    findManyProjects: (
      query: FindManyProjectsParams,
      params: RequestParams = {},
    ) =>
      this.request<FindManyProjectsData, void>({
        path: `/api/projects`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name CreateProject
     * @summary Create a project
     * @request POST:/api/projects
     * @secure
     */
    createProject: (data: CreateProjectDto, params: RequestParams = {}) =>
      this.request<CreateProjectData, void>({
        path: `/api/projects`,
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
     * @tags Projects
     * @name FindOneProject
     * @summary Get one project
     * @request GET:/api/projects/{id}
     * @secure
     */
    findOneProject: (id: number, params: RequestParams = {}) =>
      this.request<FindOneProjectData, void>({
        path: `/api/projects/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name DeleteOneProject
     * @summary Delete a project
     * @request DELETE:/api/projects/{id}
     * @secure
     */
    deleteOneProject: (id: number, params: RequestParams = {}) =>
      this.request<DeleteOneProjectData, void>({
        path: `/api/projects/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name UpdateProject
     * @summary Update a project
     * @request PUT:/api/projects/{id}
     * @secure
     */
    updateProject: (
      id: number,
      data: UpdateProjectDto,
      params: RequestParams = {},
    ) =>
      this.request<UpdateProjectData, void>({
        path: `/api/projects/${id}`,
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
     * @tags Projects
     * @name GetProjectUsageHistory
     * @summary Get usage history for a project
     * @request GET:/api/projects/{id}/usage/history
     * @secure
     */
    getProjectUsageHistory: (
      { id, ...query }: GetProjectUsageHistoryParams,
      params: RequestParams = {},
    ) =>
      this.request<GetProjectUsageHistoryData, void>({
        path: `/api/projects/${id}/usage/history`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name GetProjectUsageStats
     * @summary Get aggregated usage statistics for a project
     * @request GET:/api/projects/{id}/usage/stats
     * @secure
     */
    getProjectUsageStats: (
      { id, ...query }: GetProjectUsageStatsParams,
      params: RequestParams = {},
    ) =>
      this.request<GetProjectUsageStatsData, void>({
        path: `/api/projects/${id}/usage/stats`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ListProjectMembers
     * @summary List project members
     * @request GET:/api/projects/{id}/members
     * @secure
     */
    listProjectMembers: (id: number, params: RequestParams = {}) =>
      this.request<ListProjectMembersData, void>({
        path: `/api/projects/${id}/members`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name RemoveProjectMember
     * @summary Remove a project member
     * @request DELETE:/api/projects/{id}/members/{memberId}
     * @secure
     */
    removeProjectMember: (
      id: number,
      memberId: number,
      params: RequestParams = {},
    ) =>
      this.request<RemoveProjectMemberData, void>({
        path: `/api/projects/${id}/members/${memberId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ListProjectInvitations
     * @summary List project invitations
     * @request GET:/api/projects/{id}/invitations
     * @secure
     */
    listProjectInvitations: (id: number, params: RequestParams = {}) =>
      this.request<ListProjectInvitationsData, void>({
        path: `/api/projects/${id}/invitations`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name CreateProjectInvitation
     * @summary Create a project invitation
     * @request POST:/api/projects/{id}/invitations
     * @secure
     */
    createProjectInvitation: (
      id: number,
      data: CreateProjectInvitationDto,
      params: RequestParams = {},
    ) =>
      this.request<CreateProjectInvitationData, void>({
        path: `/api/projects/${id}/invitations`,
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
     * @tags Projects
     * @name ResendProjectInvitation
     * @summary Resend a project invitation
     * @request POST:/api/projects/{id}/invitations/{invitationId}/resend
     * @secure
     */
    resendProjectInvitation: (
      id: number,
      invitationId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResendProjectInvitationData, void>({
        path: `/api/projects/${id}/invitations/${invitationId}/resend`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name CancelProjectInvitation
     * @summary Cancel a project invitation
     * @request DELETE:/api/projects/{id}/invitations/{invitationId}
     * @secure
     */
    cancelProjectInvitation: (
      id: number,
      invitationId: number,
      params: RequestParams = {},
    ) =>
      this.request<CancelProjectInvitationData, void>({
        path: `/api/projects/${id}/invitations/${invitationId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  projectInvitations = {
    /**
     * No description
     *
     * @tags Project Invitations
     * @name ListMyProjectInvitations
     * @summary List pending project invitations for the authenticated user
     * @request GET:/api/project-invitations
     * @secure
     */
    listMyProjectInvitations: (params: RequestParams = {}) =>
      this.request<ListMyProjectInvitationsData, void>({
        path: `/api/project-invitations`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Project Invitations
     * @name AcceptProjectInvitation
     * @summary Accept a project invitation
     * @request POST:/api/project-invitations/{invitationId}/accept
     * @secure
     */
    acceptProjectInvitation: (
      invitationId: number,
      params: RequestParams = {},
    ) =>
      this.request<AcceptProjectInvitationData, void>({
        path: `/api/project-invitations/${invitationId}/accept`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Project Invitations
     * @name DeclineProjectInvitation
     * @summary Decline a project invitation
     * @request POST:/api/project-invitations/{invitationId}/decline
     * @secure
     */
    declineProjectInvitation: (
      invitationId: number,
      params: RequestParams = {},
    ) =>
      this.request<DeclineProjectInvitationData, void>({
        path: `/api/project-invitations/${invitationId}/decline`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  resourceForms = {
    /**
     * No description
     *
     * @tags Resource Forms
     * @name ResourceFormsList
     * @summary List forms for a resource
     * @request GET:/api/resources/{resourceId}/forms
     * @secure
     */
    resourceFormsList: (resourceId: number, params: RequestParams = {}) =>
      this.request<ResourceFormsListData, void>({
        path: `/api/resources/${resourceId}/forms`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resource Forms
     * @name ResourceFormsCreate
     * @summary Create a form
     * @request POST:/api/resources/{resourceId}/forms
     * @secure
     */
    resourceFormsCreate: (
      resourceId: number,
      data: CreateFormDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFormsCreateData, void>({
        path: `/api/resources/${resourceId}/forms`,
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
     * @tags Resource Forms
     * @name ResourceFormsGetRequirements
     * @summary Get required forms for a resource action
     * @request GET:/api/resources/{resourceId}/forms/requirements
     * @secure
     */
    resourceFormsGetRequirements: (
      { resourceId, ...query }: ResourceFormsGetRequirementsParams,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFormsGetRequirementsData, void>({
        path: `/api/resources/${resourceId}/forms/requirements`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resource Forms
     * @name ResourceFormsGetOne
     * @summary Get a form by id
     * @request GET:/api/resources/{resourceId}/forms/{formId}
     * @secure
     */
    resourceFormsGetOne: (
      resourceId: number,
      formId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFormsGetOneData, void>({
        path: `/api/resources/${resourceId}/forms/${formId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Resource Forms
     * @name ResourceFormsUpdate
     * @summary Update a form
     * @request PUT:/api/resources/{resourceId}/forms/{formId}
     * @secure
     */
    resourceFormsUpdate: (
      resourceId: number,
      formId: number,
      data: UpdateFormDto,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFormsUpdateData, void>({
        path: `/api/resources/${resourceId}/forms/${formId}`,
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
     * @tags Resource Forms
     * @name ResourceFormsDelete
     * @summary Delete a form
     * @request DELETE:/api/resources/{resourceId}/forms/{formId}
     * @secure
     */
    resourceFormsDelete: (
      resourceId: number,
      formId: number,
      params: RequestParams = {},
    ) =>
      this.request<ResourceFormsDeleteData, void>({
        path: `/api/resources/${resourceId}/forms/${formId}`,
        method: "DELETE",
        secure: true,
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
     * @name DownloadFirmwareBinary
     * @summary Download OTA firmware by name and variant
     * @request GET:/api/attractap/firmwares/{firmwareName}/variants/{variantName}
     */
    downloadFirmwareBinary: (
      firmwareName: string,
      variantName: string,
      params: RequestParams = {},
    ) =>
      this.request<DownloadFirmwareBinaryData, any>({
        path: `/api/attractap/firmwares/${firmwareName}/variants/${variantName}`,
        method: "GET",
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
     * @name GetResourceUsageHoursInDateRange
     * @summary Get the resource usage hours in the date range
     * @request GET:/api/analytics/resource-usage-hours
     * @secure
     */
    getResourceUsageHoursInDateRange: (
      query: GetResourceUsageHoursInDateRangeParams,
      params: RequestParams = {},
    ) =>
      this.request<GetResourceUsageHoursInDateRangeData, void>({
        path: `/api/analytics/resource-usage-hours`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Analytics
     * @name GetBillingTransactionsInDateRange
     * @summary Get the billing transactions in the date range
     * @request GET:/api/analytics/billing-transactions
     * @secure
     */
    getBillingTransactionsInDateRange: (
      query: GetBillingTransactionsInDateRangeParams,
      params: RequestParams = {},
    ) =>
      this.request<GetBillingTransactionsInDateRangeData, void>({
        path: `/api/analytics/billing-transactions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
