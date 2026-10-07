import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import sqlite3 from 'sqlite3';
export const script = path.resolve('scripts/seed-dev-user.mjs');
export const execute = (db, sql) =>
  new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
export const rows = (db, sql) =>
  new Promise((resolve, reject) => db.all(sql, (error, values) => (error ? reject(error) : resolve(values))));
export const close = (db) => new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));

export async function database() {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-seed-test-'));
  const file = path.join(directory, 'test.sqlite');
  const db = new sqlite3.Database(file);
  await execute(
    db,
    `
    CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT UNIQUE, email TEXT UNIQUE, isEmailVerified INTEGER, isDisabled INTEGER, failedLoginAttempts INTEGER, firstFailedLoginAt TEXT, lockedUntil TEXT);
    CREATE TABLE authentication_detail (id INTEGER PRIMARY KEY, userId INTEGER, type TEXT, password TEXT);
    CREATE TABLE role (id INTEGER PRIMARY KEY, key TEXT UNIQUE, name TEXT, description TEXT, isSystemManaged INTEGER, isDefault INTEGER);
    CREATE TABLE permission (key TEXT PRIMARY KEY);
    CREATE TABLE role_permission (id INTEGER PRIMARY KEY, roleId INTEGER, permissionKey TEXT);
    CREATE TABLE user_role (id INTEGER PRIMARY KEY, userId INTEGER, roleId INTEGER, source TEXT);
    CREATE TABLE resource_group (id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT);
    CREATE TABLE resource (id INTEGER PRIMARY KEY, name TEXT, type TEXT, description TEXT, deletedAt TEXT);
    CREATE TABLE resource_groups_resource_group (resourceId INTEGER, resourceGroupId INTEGER, UNIQUE(resourceId, resourceGroupId));
    CREATE TABLE resource_usage (id INTEGER PRIMARY KEY, resourceId INTEGER, userId INTEGER, usageAction TEXT,
      startTime TEXT, startNotes TEXT, endTime TEXT, isFinalized INTEGER DEFAULT 0, lifecyclePending INTEGER DEFAULT 0);
    CREATE TABLE resource_usage_lifecycle_attempt (id TEXT PRIMARY KEY, resourceId INTEGER, kind TEXT,
      candidateUsageId INTEGER, previousUsageId INTEGER);
    INSERT INTO role VALUES (1, 'administrator', 'Admin', '', 1, 0);
    INSERT INTO permission VALUES ('resources.read');
  `,
  );
  return { directory, file, db };
}
