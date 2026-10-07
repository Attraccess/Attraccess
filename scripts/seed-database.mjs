export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

export async function hasTable(db, table) {
  return Boolean(await get(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

export async function getColumns(db, table) {
  return (await all(db, `PRAGMA table_info("${table}")`)).map((row) => row.name);
}
