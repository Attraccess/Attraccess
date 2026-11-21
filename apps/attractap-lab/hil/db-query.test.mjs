// db-query.mjs answers the HIL tests' SQL with the types the API reads: a bigint column (coredumpSize) must compare
// equal to the number a test expects, as it did on SQLite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const DB_QUERY = fileURLToPath(new URL('./db-query.mjs', import.meta.url));
const server = process.env.TEST_DATABASE_URL;
const skip = server ? false : 'TEST_DATABASE_URL is not set';

function query(sql, params = []) {
  const done = spawnSync(process.execPath, [DB_QUERY], {
    input: JSON.stringify({ sql, params }),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: server },
  });
  return { status: done.status, stderr: done.stderr, answer: done.status === 0 ? JSON.parse(done.stdout) : null };
}

test('bigint values and counts come back as numbers', { skip }, () => {
  const { status, stderr, answer } = query(
    'SELECT ?::bigint AS "coredumpSize", COUNT(*) AS n, ?::integer AS small FROM (VALUES (1), (2)) AS v(x)',
    [84896, 7],
  );
  assert.equal(status, 0, stderr);
  assert.deepEqual(answer.columns, ['coredumpSize', 'n', 'small']);
  assert.deepEqual(answer.rows, [[84896, 2, 7]]);
});

test('a bigint beyond the safe integer range fails instead of losing precision', { skip }, () => {
  const { status, stderr } = query('SELECT 9007199254740993::bigint AS big');
  assert.notEqual(status, 0);
  assert.match(stderr, /exceeds the safe integer range/);
});
