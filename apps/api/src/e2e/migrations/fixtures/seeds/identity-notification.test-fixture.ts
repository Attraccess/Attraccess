import type { DataSource } from 'typeorm';
import {
  ApiToken,
  ApiTokenPermission,
  CompanionDevice,
  Conversation,
  ConversationParticipant,
  EmailTemplate,
  EmailTemplateType,
  Message,
  NFCCard,
  NotificationPreference,
  Passkey,
  PasskeyChallenge,
  PasswordHistory,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  Permission,
  PushSubscription,
  Role,
  User,
  UserRole,
  UserRoleSource,
} from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';
export async function migrationIdentityNotificationSeeds(dataSource: DataSource, seedTag: string, primaryUser: User) {
  const nfcCardRepo = dataSource.getRepository(NFCCard);

  const emailTemplateRepo = dataSource.getRepository(EmailTemplate);

  const passwordHistoryRepo = dataSource.getRepository(PasswordHistory);

  const passwordPolicyOverrideRepo = dataSource.getRepository(PasswordPolicyOverride);

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

  const roleRepo = dataSource.getRepository(Role);

  const userRoleRepo = dataSource.getRepository(UserRole);

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
}
