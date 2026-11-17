import { instanceToPlain } from 'class-transformer';
import {
  BillingTransaction,
  BillingTransactionItem,
  Resource,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { BillingTransactionStatus, ResourceUsageAction } from '@attraccess/application-models';
import { toBillingTransactionExportRow, toResourceUsageExportRow } from './export-rows';

const PRIVATE_USER_FIELDS = [
  'email',
  'emailVerificationToken',
  'passwordResetToken',
  'deleteAccountToken',
  'nfcKeySeedToken',
  'lockedUntil',
  'failedLoginAttempts',
];

/** A user as the database loads it: every column, private ones included. */
function storedUser(id: number): User {
  return Object.assign(new User(), {
    emailVerificationToken: 'verify-secret',
    emailVerificationTokenExpiresAt: new Date('2026-01-01T00:00:00Z'),
    passwordResetToken: 'reset-secret',
    passwordResetTokenExpiresAt: null,
    lastUsernameChangeAt: null,
    lockedUntil: new Date('2026-01-02T00:00:00Z'),
    failedLoginAttempts: 3,
    firstFailedLoginAt: null,
    deleteAccountToken: 'delete-secret',
    deleteAccountTokenExpiresAt: null,
    deleteAccountRequestedAt: null,
    nfcKeySeedToken: 'seed-secret',
    id,
    username: `user-${id}`,
    email: `user-${id}@example.com`,
    locale: 'en',
    dateTimeLocale: null,
    isEmailVerified: true,
    isDisabled: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    deletedAt: null,
    externalIdentifier: 'EXT-1',
    creditBalance: 50,
    billingFactor: 100,
  });
}

function storedUsage(): ResourceUsage {
  return Object.assign(new ResourceUsage(), {
    sessionDurationCreditsPerMinute: 2,
    operatingDurationCreditsPerMinute: null,
    creditsPerUsage: 5,
    billingFactor: 100,
    meterRates: [{ meterId: 1, name: 'kWh', creditsPerUnit: 3 }],
    attributedOperatingDurationInMinutes: 12.5,
    id: 7,
    usageAction: ResourceUsageAction.Usage,
    resourceId: 3,
    userId: 1,
    startTime: new Date('2025-02-01T10:00:00Z'),
    startNotes: 'start',
    endTime: new Date('2025-02-01T11:00:00Z'),
    endNotes: null,
    usageInMinutes: 60,
    projectId: null,
    isFinalized: true,
    lifecyclePending: false,
    supervisorUserId: 2,
    resource: Object.assign(new Resource(), { id: 3, name: 'Laser', metadata: { costCenter: '4711' } }),
    user: storedUser(1),
    supervisorUser: storedUser(2),
  });
}

function storedTransaction(): BillingTransaction {
  return Object.assign(new BillingTransaction(), {
    id: 9,
    userId: 1,
    createdAt: new Date('2025-02-01T11:00:00Z'),
    updatedAt: new Date('2025-02-01T11:00:00Z'),
    amount: -120,
    initiatorId: 2,
    resourceUsageId: 7,
    refundOfId: null,
    correctionOfId: null,
    externalReference: null,
    status: BillingTransactionStatus.Completed,
    user: storedUser(1),
    initiator: storedUser(2),
    resourceUsage: Object.assign(new ResourceUsage(), {
      id: 7,
      resource: Object.assign(new Resource(), { id: 3, name: 'Laser' }),
    }),
    items: [Object.assign(new BillingTransactionItem(), { id: 1, billingTransactionId: 9, name: 'Usage' })],
  });
}

// The response the export endpoints sent before the rows were mapped field by field: the stored entity with the
// email fields added, serialized by the global ClassSerializerInterceptor.
class LegacyUsageRow extends ResourceUsage {
  userEmail!: string | null;
  supervisorEmail!: string | null;
}
class LegacyTransactionRow extends BillingTransaction {
  userEmail!: string | null;
  initiatorEmail!: string | null;
}

const asJson = (value: unknown) => JSON.parse(JSON.stringify(instanceToPlain(value)));

describe('analytics export row mapping', () => {
  it('serializes a usage row exactly like the stored entity with the email fields', () => {
    const usage = storedUsage();
    const legacy = Object.assign(new LegacyUsageRow(), usage, {
      userEmail: usage.user?.email ?? null,
      supervisorEmail: usage.supervisorUser?.email ?? null,
    });

    expect(asJson(toResourceUsageExportRow(usage))).toEqual(asJson(legacy));
  });

  it('serializes a billing row exactly like the stored entity with the email fields', () => {
    const transaction = storedTransaction();
    for (const includeEmail of [true, false]) {
      const legacy = Object.assign(new LegacyTransactionRow(), transaction, {
        userEmail: includeEmail ? (transaction.user?.email ?? null) : null,
        initiatorEmail: includeEmail ? (transaction.initiator?.email ?? null) : null,
      });

      expect(asJson(toBillingTransactionExportRow(transaction, includeEmail))).toEqual(asJson(legacy));
    }
  });

  it('never carries private user fields in the nested users, even without the serializer', () => {
    const usageRow = toResourceUsageExportRow(storedUsage());
    const billingRow = toBillingTransactionExportRow(storedTransaction(), true);

    for (const user of [usageRow.user, usageRow.supervisorUser, billingRow.user, billingRow.initiator]) {
      expect(user).toBeDefined();
      for (const field of PRIVATE_USER_FIELDS) expect(user).not.toHaveProperty(field);
    }
    expect(usageRow).toMatchObject({ userEmail: 'user-1@example.com', supervisorEmail: 'user-2@example.com' });
    expect(billingRow).toMatchObject({ userEmail: 'user-1@example.com', initiatorEmail: 'user-2@example.com' });
  });

  it('keeps a deleted user as null', () => {
    const usage = Object.assign(storedUsage(), { user: null, userId: null, supervisorUser: null });

    expect(toResourceUsageExportRow(usage)).toMatchObject({ user: null, supervisorUser: null, userEmail: null });
  });
});
