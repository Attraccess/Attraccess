import { readFileSync } from 'node:fs';
import { get, run } from './seed-database.mjs';
import { assignRole } from './seed-users.mjs';

export const DEMO_FIXTURE = {
  resourceGroups: [{ name: 'Demo Workshop', description: 'Resources used for local development.' }],
  resources: [
    {
      name: 'Demo 3D Printer',
      type: 'machine',
      description: 'A safe local-development resource.',
      groups: ['Demo Workshop'],
    },
  ],
  roles: [
    {
      key: 'demo-resource-user',
      name: 'Demo Resource User',
      description: 'Can view the local demo resource.',
      permissions: ['resources.read'],
    },
  ],
};

export function loadFixture(fixturePath) {
  try {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
      throw new Error('fixture must be a JSON object');
    }
    return fixture;
  } catch (error) {
    throw new Error(`Could not read fixture ${fixturePath}: ${error.message}`);
  }
}

export async function applyFixture(db, fixture) {
  await applyResourceGroups(db, fixture.resourceGroups ?? []);
  await applyResources(db, fixture.resources ?? []);
  await applyRoles(db, fixture.roles ?? []);
  for (const assignment of fixture.userRoles ?? []) {
    if (!assignment.username || !assignment.roleKey)
      throw new Error('Every user role assignment requires username and roleKey');
    await assignRole(db, assignment.username, assignment.roleKey);
  }
}

export async function applyResourceGroups(db, entries) {
  for (const group of entries) {
    if (!group.name) throw new Error('Every resource group requires a name');
    const existing = await get(db, 'SELECT id FROM resource_group WHERE name = ?', [group.name]);
    if (existing) {
      if (Object.hasOwn(group, 'description')) {
        await run(db, 'UPDATE resource_group SET description = ? WHERE id = ?', [group.description, existing.id]);
      }
    } else {
      await run(db, 'INSERT INTO resource_group (name, description) VALUES (?, ?)', [
        group.name,
        group.description ?? null,
      ]);
    }
  }
}

export async function applyResources(db, entries) {
  for (const resource of entries) {
    if (!resource.name || !['machine', 'door'].includes(resource.type)) {
      throw new Error('Every resource requires a name and a type of machine or door');
    }
    const existing = await get(db, 'SELECT id FROM resource WHERE name = ? AND deletedAt IS NULL', [resource.name]);
    let resourceId = existing?.id;
    if (resourceId) {
      if (Object.hasOwn(resource, 'description')) {
        await run(db, 'UPDATE resource SET type = ?, description = ? WHERE id = ?', [
          resource.type,
          resource.description,
          resourceId,
        ]);
      } else {
        await run(db, 'UPDATE resource SET type = ? WHERE id = ?', [resource.type, resourceId]);
      }
    } else {
      const result = await run(db, 'INSERT INTO resource (name, type, description) VALUES (?, ?, ?)', [
        resource.name,
        resource.type,
        resource.description ?? null,
      ]);
      resourceId = result.lastID;
    }
    for (const groupName of resource.groups ?? []) {
      const group = await get(db, 'SELECT id FROM resource_group WHERE name = ?', [groupName]);
      if (!group) throw new Error(`Resource group not found: ${groupName}`);
      await run(
        db,
        'INSERT OR IGNORE INTO resource_groups_resource_group (resourceId, resourceGroupId) VALUES (?, ?)',
        [resourceId, group.id],
      );
    }
  }
}

export async function applyRoles(db, entries) {
  for (const role of entries) {
    if (!role.key || !role.name || !Array.isArray(role.permissions)) {
      throw new Error('Every role requires key, name, and permissions');
    }
    const unknownPermissions = [];
    for (const permissionKey of role.permissions) {
      if (!(await get(db, 'SELECT key FROM permission WHERE key = ?', [permissionKey])))
        unknownPermissions.push(permissionKey);
    }
    if (unknownPermissions.length) throw new Error(`Unknown permission keys: ${unknownPermissions.join(', ')}`);
    const existing = await get(db, 'SELECT id, isSystemManaged FROM "role" WHERE key = ?', [role.key]);
    let roleId = existing?.id;
    if (roleId) {
      if (existing.isSystemManaged) throw new Error(`Fixture cannot modify system-managed role: ${role.key}`);
      if (Object.hasOwn(role, 'description')) {
        await run(db, 'UPDATE "role" SET name = ?, description = ? WHERE id = ?', [
          role.name,
          role.description,
          roleId,
        ]);
      } else {
        await run(db, 'UPDATE "role" SET name = ? WHERE id = ?', [role.name, roleId]);
      }
    } else {
      const result = await run(
        db,
        'INSERT INTO "role" (key, name, description, isSystemManaged, isDefault) VALUES (?, ?, ?, 0, 0)',
        [role.key, role.name, role.description ?? ''],
      );
      roleId = result.lastID;
    }
    for (const permissionKey of role.permissions) {
      const grant = await get(db, 'SELECT id FROM role_permission WHERE roleId = ? AND permissionKey = ?', [
        roleId,
        permissionKey,
      ]);
      if (!grant)
        await run(db, 'INSERT INTO role_permission (roleId, permissionKey) VALUES (?, ?)', [roleId, permissionKey]);
    }
  }
}
