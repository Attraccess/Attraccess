import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource, DeepPartial, Repository } from 'typeorm';
import {
  Attractap,
  AttractapCrashReport,
  AuditLog,
  CompanionDevice,
  AuthenticationDetail,
  AuthenticationType,
  ApiToken,
  ApiTokenPermission,
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  Conversation,
  ConversationParticipant,
  EmailTemplate,
  EmailTemplateType,
  Form,
  FormField,
  FormFieldType,
  FormSubmission,
  IntroductionHistoryAction,
  Message,
  MqttServer,
  NFCCard,
  NotificationPreference,
  Passkey,
  PasskeyChallenge,
  PasswordHistory,
  PasswordPolicyAudit,
  PasswordPolicyAuditEvent,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  Permission,
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  PushSubscription,
  Resource,
  ResourceBillingConfiguration,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  ResourceFormAction,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroducer,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  MaintenanceRequestStatus,
  ResourceHealthSource,
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  Session,
  Setting,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
  User,
  entities,
  UsageDurationUnit,
  Role,
  UserRole,
  UserRoleSource,
} from '@attraccess/database-entities';

jest.setTimeout(120_000);

type NoInfer<T> = [T][T extends unknown ? 0 : never];

const getTestStorageRoot = async () => {
  if (process.env.STORAGE_ROOT) {
    await fs.mkdir(process.env.STORAGE_ROOT, { recursive: true });
    return process.env.STORAGE_ROOT;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-migrations-e2e-'));
  return dir;
};

const ensureEntity = async <T>(repo: Repository<T>, builder: () => DeepPartial<NoInfer<T>>): Promise<T> => {
  const [existing] = await repo.find({ take: 1 });
  if (existing) {
    return existing;
  }

  return repo.save(repo.create(builder()));
};

const ensureUsers = async (dataSource: DataSource, seedTag: string) => {
  const userRepo = dataSource.getRepository(User);
  let users = await userRepo.find({ take: 2, order: { id: 'ASC' } });
  const newUsers: DeepPartial<User>[] = [];

  if (users.length < 1) {
    newUsers.push({
      username: `seed_user_${seedTag}_1`,
      email: `seed_user_${seedTag}_1@example.com`,
    });
  }

  if (users.length < 2) {
    newUsers.push({
      username: `seed_user_${seedTag}_2`,
      email: `seed_user_${seedTag}_2@example.com`,
    });
  }

  if (newUsers.length > 0) {
    const savedUsers = await userRepo.save(newUsers.map((user) => userRepo.create(user)));
    users = [...users, ...savedUsers];
  }

  if (!users[0]) {
    throw new Error('Failed to seed users for migration test');
  }

  return { primaryUser: users[0], secondaryUser: users[1] ?? users[0] };
};

const seedDatabase = async (dataSource: DataSource) => {
  const seedTag = Date.now().toString(36);
  const { primaryUser, secondaryUser } = await ensureUsers(dataSource, seedTag);

  await ensureEntity(dataSource.getRepository(AuditLog), () => ({
    at: new Date(),
    domain: 'wago',
    pluginId: 'abcdefghijklmnopqrstu',
    action: 'wago.publication',
    operationId: '00000000-0000-4000-8000-000000000001',
    actorId: primaryUser.id,
    authenticationMethod: 'session',
    apiTokenId: null,
    outcome: 'succeeded',
    subjectType: 'wago.controller',
    subjectId: 7,
    details: { revision: 1 },
  }));

  const resourceGroupRepo = dataSource.getRepository(ResourceGroup);
  const resourceRepo = dataSource.getRepository(Resource);
  const operatingIntervalRepo = dataSource.getRepository(ResourceOperatingInterval);
  const projectRepo = dataSource.getRepository(Project);
  const mqttRepo = dataSource.getRepository(MqttServer);
  const ssoProviderRepo = dataSource.getRepository(SSOProvider);
  const ssoConfigRepo = dataSource.getRepository(SSOProviderOIDCConfiguration);
  const ssoSamlConfigRepo = dataSource.getRepository(SSOProviderSAMLConfiguration);
  const authenticationRepo = dataSource.getRepository(AuthenticationDetail);
  const sessionRepo = dataSource.getRepository(Session);
  const settingRepo = dataSource.getRepository(Setting);
  const attractapRepo = dataSource.getRepository(Attractap);
  const billingConfigRepo = dataSource.getRepository(ResourceBillingConfiguration);
  const resourceMaintenanceRepo = dataSource.getRepository(ResourceMaintenance);
  const maintenanceScheduleRepo = dataSource.getRepository(ResourceMaintenanceSchedule);
  const maintenanceScheduleUsageHoursConfigRepo = dataSource.getRepository(
    ResourceMaintenanceScheduleUsageHoursConfig,
  );
  const maintenanceScheduleUsageCountConfigRepo = dataSource.getRepository(
    ResourceMaintenanceScheduleUsageCountConfig,
  );
  const maintenanceScheduleTimeIntervalConfigRepo = dataSource.getRepository(
    ResourceMaintenanceScheduleTimeIntervalConfig,
  );
  const flowNodeRepo = dataSource.getRepository(ResourceFlowNode);
  const flowEdgeRepo = dataSource.getRepository(ResourceFlowEdge);
  const flowVariableRepo = dataSource.getRepository(ResourceFlowVariable);
  const usageRepo = dataSource.getRepository(ResourceUsage);
  const billingTransactionRepo = dataSource.getRepository(BillingTransaction);
  const billingItemRepo = dataSource.getRepository(BillingTransactionItem);
  const introductionRepo = dataSource.getRepository(ResourceIntroduction);
  const introducerRepo = dataSource.getRepository(ResourceIntroducer);
  const introductionHistoryRepo = dataSource.getRepository(ResourceIntroductionHistoryItem);
  const projectMemberRepo = dataSource.getRepository(ProjectMember);
  const projectInvitationRepo = dataSource.getRepository(ProjectInvitation);
  const formRepo = dataSource.getRepository(Form);
  const formFieldRepo = dataSource.getRepository(FormField);
  const formSubmissionRepo = dataSource.getRepository(FormSubmission);
  const nfcCardRepo = dataSource.getRepository(NFCCard);
  const emailTemplateRepo = dataSource.getRepository(EmailTemplate);
  const passwordHistoryRepo = dataSource.getRepository(PasswordHistory);
  const passwordPolicyOverrideRepo = dataSource.getRepository(PasswordPolicyOverride);
  const passwordPolicyAuditRepo = dataSource.getRepository(PasswordPolicyAudit);
  const conversationRepo = dataSource.getRepository(Conversation);
  const conversationParticipantRepo = dataSource.getRepository(ConversationParticipant);
  const messageRepo = dataSource.getRepository(Message);
  const notificationPreferenceRepo = dataSource.getRepository(NotificationPreference);
  const pushSubscriptionRepo = dataSource.getRepository(PushSubscription);
  const companionDeviceRepo = dataSource.getRepository(CompanionDevice);
  const passkeyRepo = dataSource.getRepository(Passkey);
  const passkeyChallengeRepo = dataSource.getRepository(PasskeyChallenge);
  const apiTokenRepo = dataSource.getRepository(ApiToken);
  const apiTokenPermissionRepo = dataSource.getRepository(ApiTokenPermission);
  const permissionRepo = dataSource.getRepository(Permission);

  const resourceGroup = await ensureEntity(resourceGroupRepo, () => ({
    name: `Seed Group ${seedTag}`,
    description: 'Seed resource group',
  }));

  const resource = await ensureEntity(resourceRepo, () => ({
    name: `Seed Resource ${seedTag}`,
    type: ResourceType.Machine,
    description: 'Seed resource',
    allowTakeOver: false,
    separateUnlockAndUnlatch: false,
  }));

  await ensureEntity(operatingIntervalRepo, () => ({
    resourceId: resource.id,
    startTime: new Date(),
    endTime: null,
  }));

  const project = await ensureEntity(projectRepo, () => ({
    name: `Seed Project ${seedTag}`,
    description: 'Seed project',
    owner: primaryUser,
  }));

  await ensureEntity(mqttRepo, () => ({
    name: `Seed MQTT ${seedTag}`,
    host: 'localhost',
    port: 1883,
  }));

  const ssoProvider = await ensureEntity(ssoProviderRepo, () => ({
    name: `Seed SSO ${seedTag}`,
    type: SSOProviderType.OIDC,
  }));

  const samlProvider =
    (await ssoProviderRepo.findOne({ where: { type: SSOProviderType.SAML } })) ??
    (await ssoProviderRepo.save(
      ssoProviderRepo.create({
        name: `Seed SSO SAML ${seedTag}`,
        type: SSOProviderType.SAML,
      }),
    ));

  await ensureEntity(ssoConfigRepo, () => ({
    ssoProviderId: ssoProvider.id,
    issuer: 'https://issuer.example.com',
    authorizationURL: 'https://issuer.example.com/auth',
    tokenURL: 'https://issuer.example.com/token',
    userInfoURL: 'https://issuer.example.com/userinfo',
    clientId: `seed-client-${seedTag}`,
    clientSecret: `seed-secret-${seedTag}`,
    scopes: ['openid', 'email'],
    usernameClaimPaths: ['preferred_username'],
    emailClaimPaths: ['email'],
  }));

  const existingSamlConfig = await ssoSamlConfigRepo.findOne({ where: { ssoProviderId: samlProvider.id } });
  if (!existingSamlConfig) {
    await ssoSamlConfigRepo.save(
      ssoSamlConfigRepo.create({
        ssoProviderId: samlProvider.id,
        entryPoint: 'https://saml.example.com/sso',
        issuer: 'https://app.example.com',
        certificate: 'seed-certificate',
        audience: null,
        signRequest: false,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: true,
        forceAuthn: false,
        emailAttributeKeys: ['email'],
        spSigningCertificate: null,
        spSigningKeyEncrypted: null,
        spSigningKeyEncryptionKeyId: null,
      }),
    );
  }

  await ensureEntity(authenticationRepo, () => ({
    userId: primaryUser.id,
    type: AuthenticationType.LOCAL_PASSWORD,
    password: 'hashed-password',
  }));

  await ensureEntity(sessionRepo, () => ({
    token: `seed-session-${seedTag}`,
    userId: primaryUser.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }));

  await ensureEntity(settingRepo, () => ({
    parent: 'system',
    key: `seed-setting-${seedTag}`,
    value: 'true',
  }));

  const attractap = await ensureEntity(attractapRepo, () => ({
    name: `Seed Reader ${seedTag}`,
    apiTokenHash: `seed-token-${seedTag}`,
    firmware: {
      name: 'Seed Firmware',
      variant: 'seed',
      version: '1.0.0',
      capabilities: {
        resourceSelection: true,
        resourceActionSelection: false,
        cardEnrollment: true,
      },
    },
  }));

  const attractapCrashReportRepo = dataSource.getRepository(AttractapCrashReport);
  await ensureEntity(attractapCrashReportRepo, () => ({
    attractapId: attractap.id,
    resetReason: 'TASK_WDT',
    heapFreeBytes: 48213,
    largestFreeBlockBytes: 20480,
    uptimeBeforeResetMs: 372000,
    wsState: 'CONNECTED',
    wifiState: 'GOT_IP',
    firmwareVersion: '1.0.0',
    coredumpSize: null,
    coredump: null,
  }));

  await ensureEntity(billingConfigRepo, () => ({
    resourceId: resource.id,
    creditsPerUsage: 10,
    creditsPerMinute: 1,
  }));

  await ensureEntity(resourceMaintenanceRepo, () => ({
    resourceId: resource.id,
    startTime: new Date(),
    endTime: null,
    reason: 'Seed maintenance',
  }));

  const resourceMaintenanceRequestRepo = dataSource.getRepository(ResourceMaintenanceRequest);
  await ensureEntity(resourceMaintenanceRequestRepo, () => ({
    resourceId: resource.id,
    reason: 'Seed maintenance request',
    status: MaintenanceRequestStatus.OPEN,
    createdByUser: { id: primaryUser.id },
    resolvedByUser: null,
    resolvedAt: null,
    resultingMaintenance: null,
  }));

  const resourceHealthRepo = dataSource.getRepository(ResourceHealthState);
  await ensureEntity(resourceHealthRepo, () => ({
    resourceId: resource.id,
    identifier: 'Seed source',
    status: ResourceHealthStatus.UNHEALTHY,
    reason: 'Seed unhealthy state',
    source: ResourceHealthSource.MANUAL,
    lastReportedAt: new Date(),
  }));

  const scheduleUsageHours = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule hours ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
    enabled: true,
  }));
  await ensureEntity(maintenanceScheduleUsageHoursConfigRepo, () => ({
    scheduleId: scheduleUsageHours.id,
    duration: 10,
    unit: UsageDurationUnit.HOURS,
  }));

  const scheduleUsageCount = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule count ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    enabled: true,
  }));
  await ensureEntity(maintenanceScheduleUsageCountConfigRepo, () => ({
    scheduleId: scheduleUsageCount.id,
    thresholdSessions: 50,
  }));

  const scheduleTimeInterval = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule interval ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
    enabled: true,
  }));
  await ensureEntity(maintenanceScheduleTimeIntervalConfigRepo, () => ({
    scheduleId: scheduleTimeInterval.id,
    duration: 500,
    unit: UsageDurationUnit.HOURS,
  }));

  const flowNode = await ensureEntity(flowNodeRepo, () => ({
    id: `seed-node-${seedTag}`,
    type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    position: { x: 10, y: 10 },
    data: {},
    resourceId: resource.id,
  }));

  await ensureEntity(flowEdgeRepo, () => ({
    id: `seed-edge-${seedTag}`,
    source: flowNode.id,
    target: flowNode.id,
    sourceHandle: null,
    targetHandle: null,
    resourceId: flowNode.resourceId,
  }));

  await ensureEntity(flowVariableRepo, () => ({
    scope: ResourceFlowVariableScope.RESOURCE,
    resourceId: resource.id,
    key: `seed-var-${seedTag}`,
    value: '"seed"',
    valueType: 'string' as const,
  }));

  const usage = await ensureEntity(usageRepo, () => ({
    usageAction: ResourceUsageAction.Usage,
    resourceId: resource.id,
    userId: primaryUser.id,
    projectId: project.id,
    startNotes: 'Seed usage',
    endNotes: null,
    isFinalized: false,
  }));

  const billingTransaction = await ensureEntity(billingTransactionRepo, () => ({
    userId: primaryUser.id,
    amount: 100,
    status: BillingTransactionStatus.Completed,
    initiatorId: secondaryUser.id,
    resourceUsageId: usage.id,
    externalReference: `seed-transaction-${seedTag}`,
  }));

  await ensureEntity(billingItemRepo, () => ({
    billingTransactionId: billingTransaction.id,
    name: 'Seed Item',
    description: 'Seed billing item',
    unitPrice: 100,
    quantity: 1,
  }));

  const introduction = await ensureEntity(introductionRepo, () => ({
    resourceId: resource.id,
    receiverUserId: primaryUser.id,
    tutorUserId: secondaryUser.id,
    resourceGroupId: resourceGroup.id,
  }));

  await ensureEntity(introducerRepo, () => ({
    resourceId: resource.id,
    userId: secondaryUser.id,
    resourceGroupId: resourceGroup.id,
  }));

  await ensureEntity(introductionHistoryRepo, () => ({
    introductionId: introduction.id,
    action: IntroductionHistoryAction.GRANT,
    performedByUserId: secondaryUser.id,
    comment: 'Seed grant',
  }));

  await ensureEntity(projectMemberRepo, () => ({
    projectId: project.id,
    userId: secondaryUser.id,
    role: ProjectMemberRole.VIEWER,
  }));

  await ensureEntity(projectInvitationRepo, () => ({
    projectId: project.id,
    inviterId: primaryUser.id,
    invitedUserId: secondaryUser.id,
    status: ProjectInvitationStatus.PENDING,
    requestedRole: ProjectMemberRole.VIEWER,
  }));

  const form = await ensureEntity(formRepo, () => ({
    name: `Seed Form ${seedTag}`,
    resourceId: resource.id,
    isRequiredOnResourceUsageStart: true,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  }));

  const formField = await ensureEntity(formFieldRepo, () => ({
    formId: form.id,
    name: 'Seed Field',
    type: FormFieldType.TEXT,
    isRequired: false,
    description: 'Seed field',
    options: null,
  }));

  await ensureEntity(formSubmissionRepo, () => ({
    formId: form.id,
    userId: primaryUser.id,
    resourceUsageId: usage.id,
    action: ResourceFormAction.START,
    data: {
      field_1: {
        value: 'seed',
        fieldDefinition: {
          id: formField.id,
          name: formField.name,
          type: formField.type,
        },
      },
    } as unknown as FormSubmission['data'],
  }));

  await ensureEntity(nfcCardRepo, () => ({
    uid: `seed-uid-${seedTag}`,
    keyNo: 1,
    key: `seed-key-${seedTag}`,
    user: primaryUser,
  }));

  await ensureEntity(emailTemplateRepo, () => ({
    type: EmailTemplateType.VERIFY_EMAIL,
    subject: 'Verify your email',
    body: 'Hello {{name}}',
    variables: ['{{name}}', '{{url}}'],
  }));

  await ensureEntity(passwordHistoryRepo, () => ({
    userId: primaryUser.id,
    passwordHash: `$2b$04$seed.${seedTag}.placeholder.bcrypt.hash.value.padding`,
  }));

  await ensureEntity(passwordPolicyOverrideRepo, () => ({
    role: PasswordPolicyRole.ADMIN,
    minLength: 16,
    maxLength: null,
    allowAllUnicode: null,
    requireUppercase: null,
    requireLowercase: null,
    requireDigit: null,
    requireSpecial: null,
    checkHIBP: null,
    checkCommonPasswords: null,
    minZxcvbnScore: null,
    historySize: null,
    rotationDays: null,
  }));

  await ensureEntity(passwordPolicyAuditRepo, () => ({
    event: PasswordPolicyAuditEvent.GLOBAL_POLICY_UPDATED,
    actorId: primaryUser.id,
    actorUsername: primaryUser.username,
    ip: '127.0.0.1',
    userAgent: 'seed-agent',
    requestId: `seed-req-${seedTag}`,
    role: null,
    before: JSON.stringify({ minLength: 12 }),
    after: JSON.stringify({ minLength: 16 }),
    changedFields: JSON.stringify(['minLength']),
  }));

  const conversation = await ensureEntity(conversationRepo, () => ({}));

  await ensureEntity(conversationParticipantRepo, () => ({
    conversationId: conversation.id,
    userId: primaryUser.id,
    lastReadAt: null,
  }));

  await ensureEntity(messageRepo, () => ({
    conversationId: conversation.id,
    senderId: primaryUser.id,
    content: 'Seed message',
    referenceType: null,
    referenceId: null,
    referenceLabel: null,
    referenceUrl: null,
  }));

  await ensureEntity(notificationPreferenceRepo, () => ({
    userId: primaryUser.id,
    messagesEmailOnOffline: true,
    messagesPushEnabled: true,
  }));

  await ensureEntity(pushSubscriptionRepo, () => ({
    userId: primaryUser.id,
    endpoint: `https://push.example.com/seed-${seedTag}`,
    p256dh: 'seed-p256dh-key',
    auth: 'seed-auth-secret',
    userAgent: 'Seed Browser/1.0',
    lastSeenAt: null,
  }));

  await ensureEntity(companionDeviceRepo, () => ({
    name: `Seed Companion ${seedTag}`,
    tokenHash: '$2b$10$seed.hash.placeholder.for.migration.testing.only',
  }));

  await ensureEntity(passkeyRepo, () => ({
    userId: primaryUser.id,
    credentialId: `seed-credential-${seedTag}`,
    publicKey: 'seed-cose-public-key',
    counter: 0,
    transports: 'internal,hybrid',
    name: `Seed Passkey ${seedTag}`,
    backedUp: true,
    lastUsedAt: null,
  }));

  await ensureEntity(passkeyChallengeRepo, () => ({
    challenge: `seed-challenge-${seedTag}`,
    userId: primaryUser.id,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  }));

  const apiToken = await ensureEntity(apiTokenRepo, () => ({
    userId: primaryUser.id,
    name: `Seed API token ${seedTag}`,
    tokenHash: `seed-api-token-hash-${seedTag}`,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  }));
  const [permission] = await permissionRepo.find({ take: 1, order: { key: 'ASC' } });
  if (!permission) throw new Error('Failed to seed an API token permission');
  await ensureEntity(apiTokenPermissionRepo, () => ({ apiTokenId: apiToken.id, permissionKey: permission.key }));

  const roleRepo = dataSource.getRepository(Role);
  const userRoleRepo = dataSource.getRepository(UserRole);
  const userRole = await roleRepo.findOne({ where: { key: 'user' } });
  if (userRole) {
    await ensureEntity(userRoleRepo, () => ({
      userId: primaryUser.id,
      roleId: userRole.id,
      source: UserRoleSource.MANUAL,
      ssoProviderType: null,
      ssoProviderId: null,
      externalValue: null,
    }));
  }
};

const assertAllEntitiesHaveRows = async (dataSource: DataSource) => {
  const emptyEntities: string[] = [];

  for (const entity of Object.values(entities)) {
    const repository = dataSource.getRepository(entity);
    const count = await repository.count();
    if (count === 0) {
      emptyEntities.push(repository.metadata.name);
    }
  }

  if (emptyEntities.length > 0) {
    throw new Error(`Missing seed data for entities: ${emptyEntities.join(', ')}`);
  }
};

const getMigrationCount = async (dataSource: DataSource) => {
  const rows = await dataSource.query('SELECT COUNT(*) as count FROM migrations');
  return Number(rows[0]?.count ?? 0);
};

const assertForeignKeysClean = async (dataSource: DataSource, context: string) => {
  const violations = await dataSource.query('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Foreign key violations after ${context}: ${JSON.stringify(violations)}`);
  }
};

const getLastMigrationName = async (dataSource: DataSource) => {
  const rows = await dataSource.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1');
  return rows[0]?.name as string | undefined;
};

describe('Migrations down/up with data (e2e)', () => {
  let dataSource: DataSource;
  let createdTempRoot: string | undefined;

  beforeAll(async () => {
    // EncryptSensitiveData migration down() needs AUTH_SESSION_SECRET to decrypt; use a stable test value.
    process.env.AUTH_SESSION_SECRET =
      process.env.AUTH_SESSION_SECRET || 'e2e-migrations-test-secret';

    const tmpRoot = await getTestStorageRoot();
    if (!process.env.STORAGE_ROOT) {
      createdTempRoot = tmpRoot;
    }
    process.env.STORAGE_ROOT = tmpRoot;

    const dsModule = await import('../database/datasource');
    dataSource = (dsModule as unknown as { default: DataSource }).default;

    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    await dataSource.query('PRAGMA foreign_keys = ON');
    await dataSource.runMigrations();
    await seedDatabase(dataSource);
    await assertAllEntitiesHaveRows(dataSource);
    await assertForeignKeysClean(dataSource, 'initial seed');
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }

    if (createdTempRoot) {
      await fs.rm(createdTempRoot, { recursive: true, force: true });
    }
  });

  it('reverts each migration and reapplies them', async () => {
    await dataSource.query('PRAGMA foreign_keys = ON');
    let remaining = await getMigrationCount(dataSource);

    while (remaining > 0) {
      const migrationName = await getLastMigrationName(dataSource);
      try {
        await dataSource.undoLastMigration();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to undo migration ${migrationName ?? 'unknown'}: ${message}`);
      }
      remaining = await getMigrationCount(dataSource);
    }

    await dataSource.runMigrations();
    await seedDatabase(dataSource);
    await assertAllEntitiesHaveRows(dataSource);
    await assertForeignKeysClean(dataSource, 'reapplied migrations');
  });
});
