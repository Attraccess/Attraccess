import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSIONS = [
  { key: 'resources.read', label: 'Read Resources', description: 'Allows reading resource information', category: 'resources' },
  { key: 'resources.create', label: 'Create Resources', description: 'Allows creating new resources', category: 'resources' },
  { key: 'resources.update', label: 'Update Resources', description: 'Allows updating existing resources', category: 'resources' },
  { key: 'resources.delete', label: 'Delete Resources', description: 'Allows deleting resources', category: 'resources' },
  { key: 'resources.access.manage', label: 'Manage Resource Access', description: 'Allows managing who can access resources', category: 'resources' },
  { key: 'resources.maintenance.manage', label: 'Manage Resource Maintenance', description: 'Allows managing resource maintenance schedules and requests', category: 'resources' },
  { key: 'users.read', label: 'Read Users', description: 'Allows reading user information', category: 'users' },
  { key: 'users.create', label: 'Create Users', description: 'Allows creating new users', category: 'users' },
  { key: 'users.update', label: 'Update Users', description: 'Allows updating existing users', category: 'users' },
  { key: 'users.delete', label: 'Delete Users', description: 'Allows deleting users', category: 'users' },
  { key: 'users.roles.manage', label: 'Manage User Roles', description: 'Allows assigning and revoking roles for users', category: 'users' },
  { key: 'system.settings.manage', label: 'Manage System Settings', description: 'Allows changing system configuration', category: 'system' },
  { key: 'system.sso.manage', label: 'Manage SSO', description: 'Allows managing SSO provider configuration', category: 'system' },
  { key: 'system.plugins.manage', label: 'Manage Plugins', description: 'Allows installing and configuring plugins', category: 'system' },
  { key: 'billing.read', label: 'Read Billing', description: 'Allows reading billing information and transactions', category: 'billing' },
  { key: 'billing.manage', label: 'Manage Billing', description: 'Allows managing billing configuration and transactions', category: 'billing' },
];

const ROLES = [
  {
    key: 'user',
    name: 'User',
    description: 'Basic authenticated user with read-only access to resources',
    isSystemManaged: 1,
    isDefault: 1,
    permissions: ['resources.read'],
  },
  {
    key: 'resource-manager',
    name: 'Resource Manager',
    description: 'Can create, update, delete, and manage access to resources',
    isSystemManaged: 1,
    isDefault: 0,
    permissions: [
      'resources.read',
      'resources.create',
      'resources.update',
      'resources.delete',
      'resources.access.manage',
      'resources.maintenance.manage',
    ],
  },
  {
    key: 'user-manager',
    name: 'User Manager',
    description: 'Can manage users and their role assignments',
    isSystemManaged: 1,
    isDefault: 0,
    permissions: [
      'users.read',
      'users.create',
      'users.update',
      'users.delete',
      'users.roles.manage',
    ],
  },
  {
    key: 'billing-manager',
    name: 'Billing Manager',
    description: 'Can read and manage billing information',
    isSystemManaged: 1,
    isDefault: 0,
    permissions: ['billing.read', 'billing.manage'],
  },
  {
    key: 'system-admin',
    name: 'System Administrator',
    description: 'Can manage system settings, SSO, and plugins',
    isSystemManaged: 1,
    isDefault: 0,
    permissions: ['system.settings.manage', 'system.sso.manage', 'system.plugins.manage'],
  },
  {
    key: 'owner',
    name: 'Owner',
    description: 'Has all permissions in the system',
    isSystemManaged: 1,
    isDefault: 0,
    permissions: PERMISSIONS.map((p) => p.key),
  },
];

export class RbacDataModel1782300000000 implements MigrationInterface {
  name = 'RbacDataModel1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create permission table
    await queryRunner.query(`
      CREATE TABLE "permission" (
        "key" text PRIMARY KEY NOT NULL,
        "label" text NOT NULL,
        "description" text NOT NULL,
        "category" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create role table
    await queryRunner.query(`
      CREATE TABLE "role" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "key" text NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "isSystemManaged" boolean NOT NULL DEFAULT (0),
        "isDefault" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_role_key" UNIQUE ("key")
      )
    `);

    // Create role_permission table
    await queryRunner.query(`
      CREATE TABLE "role_permission" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "roleId" integer NOT NULL,
        "permissionKey" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_role_permission_role" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permission_permission" FOREIGN KEY ("permissionKey") REFERENCES "permission" ("key") ON DELETE CASCADE,
        CONSTRAINT "UQ_role_permission" UNIQUE ("roleId", "permissionKey")
      )
    `);

    // Create user_role table
    await queryRunner.query(`
      CREATE TABLE "user_role" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "roleId" integer NOT NULL,
        "source" text NOT NULL DEFAULT ('manual'),
        "ssoProviderType" text,
        "ssoProviderId" integer,
        "externalValue" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_user_role_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_role_role" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_user_role" UNIQUE ("userId", "roleId", "source")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_role_permission_role" ON "role_permission" ("roleId")`);
    await queryRunner.query(`CREATE INDEX "IDX_role_permission_permissionKey" ON "role_permission" ("permissionKey")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_role_user" ON "user_role" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_role_role" ON "user_role" ("roleId")`);

    // Seed permissions
    for (const perm of PERMISSIONS) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "permission" ("key", "label", "description", "category") VALUES (?, ?, ?, ?)`,
        [perm.key, perm.label, perm.description, perm.category],
      );
    }

    // Seed roles and their permissions
    for (const role of ROLES) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "role" ("key", "name", "description", "isSystemManaged", "isDefault") VALUES (?, ?, ?, ?, ?)`,
        [role.key, role.name, role.description, role.isSystemManaged, role.isDefault],
      );

      const rows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, [role.key]);
      const roleId: number = rows[0].id;

      for (const permKey of role.permissions) {
        await queryRunner.query(
          `INSERT OR IGNORE INTO "role_permission" ("roleId", "permissionKey") VALUES (?, ?)`,
          [roleId, permKey],
        );
      }
    }

    // Migrate existing users: assign roles based on boolean permissions
    // Each mapping: if the user has the boolean flag, assign the corresponding role
    const migrations = [
      { column: 'canManageResources', roleKey: 'resource-manager' },
      { column: 'canManageSystemConfiguration', roleKey: 'system-admin' },
      { column: 'canManageUsers', roleKey: 'user-manager' },
      { column: 'canManageBilling', roleKey: 'billing-manager' },
    ];

    for (const m of migrations) {
      const roleRows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, [m.roleKey]);
      const roleId: number = roleRows[0].id;

      await queryRunner.query(
        `INSERT OR IGNORE INTO "user_role" ("userId", "roleId", "source")
         SELECT "id", ?, 'manual' FROM "user"
         WHERE "${m.column}" = 1 AND "deletedAt" IS NULL`,
        [roleId],
      );
    }

    // Assign the 'user' default role to all non-deleted users who don't already have it
    const userRoleRows = await queryRunner.query(`SELECT "id" FROM "role" WHERE "key" = ?`, ['user']);
    const userRoleId: number = userRoleRows[0].id;

    await queryRunner.query(
      `INSERT OR IGNORE INTO "user_role" ("userId", "roleId", "source")
       SELECT "id", ?, 'manual' FROM "user"
       WHERE "deletedAt" IS NULL`,
      [userRoleId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_role_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_role_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permission_permissionKey"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permission_role"`);
    await queryRunner.query(`DROP TABLE "user_role"`);
    await queryRunner.query(`DROP TABLE "role_permission"`);
    await queryRunner.query(`DROP TABLE "role"`);
    await queryRunner.query(`DROP TABLE "permission"`);
  }
}
