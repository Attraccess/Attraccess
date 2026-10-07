import bcrypt from 'bcrypt';
import { get, getColumns, hasTable, run } from './seed-database.mjs';

export async function upsertAdmin(db, { username, email, password }) {
  const userColumns = await getColumns(db, 'user');
  if (userColumns.length === 0) throw new Error('user table missing - start the API so migrations run');

  const byLowercaseName = new Map(userColumns.map((column) => [column.toLowerCase(), column]));
  const userId = (await get(db, 'SELECT id FROM "user" WHERE username = ? OR email = ?', [username, email]))?.id;
  const writableValues = {
    username,
    email,
    isEmailVerified: 1,
    isDisabled: 0,
    failedLoginAttempts: 0,
    firstFailedLoginAt: null,
    lockedUntil: null,
  };
  const fields = Object.entries(writableValues)
    .map(([name, value]) => [byLowercaseName.get(name.toLowerCase()), value])
    .filter(([column]) => column);

  let seededUserId = userId;
  if (seededUserId) {
    await run(db, `UPDATE "user" SET ${fields.map(([column]) => `"${column}" = ?`).join(', ')} WHERE id = ?`, [
      ...fields.map(([, value]) => value),
      seededUserId,
    ]);
  } else {
    const result = await run(
      db,
      `INSERT INTO "user" (${fields.map(([column]) => `"${column}"`).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map(([, value]) => value),
    );
    seededUserId = result.lastID;
  }

  if (!(await hasTable(db, 'authentication_detail'))) {
    throw new Error('authentication_detail table missing - start the API so migrations run');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const authentication = await get(
    db,
    "SELECT id FROM authentication_detail WHERE userId = ? AND type = 'local_password'",
    [seededUserId],
  );
  if (authentication) {
    await run(db, 'UPDATE authentication_detail SET password = ? WHERE id = ?', [passwordHash, authentication.id]);
  } else {
    await run(db, "INSERT INTO authentication_detail (userId, type, password) VALUES (?, 'local_password', ?)", [
      seededUserId,
      passwordHash,
    ]);
  }
  return seededUserId;
}

export async function assignRole(db, username, roleKey) {
  const user = await get(db, 'SELECT id FROM "user" WHERE username = ?', [username]);
  const role = await get(db, 'SELECT id FROM "role" WHERE key = ?', [roleKey]);
  if (!user) throw new Error(`Fixture user not found: ${username}`);
  if (!role) throw new Error(`Fixture role not found: ${roleKey}`);
  const assignment = await get(db, "SELECT id FROM user_role WHERE userId = ? AND roleId = ? AND source = 'manual'", [
    user.id,
    role.id,
  ]);
  if (!assignment) {
    await run(db, "INSERT INTO user_role (userId, roleId, source) VALUES (?, ?, 'manual')", [user.id, role.id]);
  }
}
