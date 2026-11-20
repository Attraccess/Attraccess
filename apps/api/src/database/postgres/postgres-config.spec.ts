import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATABASE_SETTINGS_DOCS_URL,
  DatabaseConfigError,
  DEFAULT_POOL_MAX,
  parsePostgresConfig,
  redactDatabaseUrl,
  sslOption,
  type DatabaseSslMode,
} from './postgres-config';

const PASSWORD = 'hunter2-S3cret';
const URL_WITH_SECRET = `postgres://attraccess:${PASSWORD}@db.internal:5432/attraccess`;

/** The thrown DatabaseConfigError (fails the test when nothing or something else is thrown). */
function configError(env: NodeJS.ProcessEnv): DatabaseConfigError {
  try {
    parsePostgresConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseConfigError);
    return error as DatabaseConfigError;
  }
  throw new Error('expected a DatabaseConfigError');
}

describe('parsePostgresConfig', () => {
  it('accepts a complete URL and applies the defaults', () => {
    expect(parsePostgresConfig({ DATABASE_URL: ` ${URL_WITH_SECRET} ` })).toEqual({
      url: URL_WITH_SECRET,
      ssl: 'off',
      poolMax: DEFAULT_POOL_MAX,
      schema: 'public',
    });
  });

  it('reads the optional settings', () => {
    expect(
      parsePostgresConfig({
        DATABASE_URL: 'postgresql://u:p@h/db?connect_timeout=5',
        DATABASE_SSL: ' Verify-Full ',
        DATABASE_POOL_MAX: '25',
        DATABASE_SCHEMA: ' Tenant_1 ',
      }),
    ).toEqual({ url: 'postgresql://u:p@h/db?connect_timeout=5', ssl: 'verify-full', poolMax: 25, schema: 'Tenant_1' });
  });

  it('accepts a socket host given as a query parameter', () => {
    expect(parsePostgresConfig({ DATABASE_URL: 'postgres:///db?host=/var/run/postgresql' }).url).toContain('host=');
  });

  it.each<[string, NodeJS.ProcessEnv, RegExp]>([
    ['a missing URL', {}, /DATABASE_URL is required/],
    ['a blank URL', { DATABASE_URL: '   ' }, /DATABASE_URL is required/],
    ['a malformed URL', { DATABASE_URL: `postgres://u:${PASSWORD}@db.internal:port/x` }, /not a valid URL/],
    [
      'a URL without a scheme',
      { DATABASE_URL: `attraccess:${PASSWORD}@db.internal` },
      /postgres:\/\/ or postgresql:\/\//,
    ],
    ['a URL with spaces', { DATABASE_URL: `postgres://u:${PASSWORD}@db host/x` }, /not a valid URL/],
    [
      'another protocol',
      { DATABASE_URL: `mysql://u:${PASSWORD}@db:3306/attraccess` },
      /postgres:\/\/ or postgresql:\/\//,
    ],
    ['an http URL', { DATABASE_URL: `https://u:${PASSWORD}@db/attraccess` }, /postgres:\/\/ or postgresql:\/\//],
    ['no host', { DATABASE_URL: `postgres:///attraccess?user=u&password=${PASSWORD}` }, /has no host/],
    ['no database', { DATABASE_URL: `postgres://u:${PASSWORD}@db:5432` }, /names no database/],
    ['an empty database', { DATABASE_URL: `postgres://u:${PASSWORD}@db:5432/` }, /names no database/],
    ...['ssl=true', 'sslmode=disable', 'sslmode=require', 'sslrootcert=/ca.pem', 'sslcert=/c.pem', 'sslkey=/k.pem']
      .concat(['sslpassword=x', 'sslcompat=libpq', 'SSLMode=disable'])
      .map((query): [string, NodeJS.ProcessEnv, RegExp] => [
        `TLS in the URL (${query.split('=')[0]})`,
        { DATABASE_URL: `${URL_WITH_SECRET}?connect_timeout=5&${query}`, DATABASE_SSL: 'verify-full' },
        /must not set TLS options \(ssl[a-z]*\): use DATABASE_SSL.*NODE_EXTRA_CA_CERTS/,
      ]),
    ...['options=-c%20lock_timeout%3D0', 'application_name=other', 'Options=-c%20search_path%3Dx'].map(
      (query): [string, NodeJS.ProcessEnv, RegExp] => [
        `session options in the URL (${query.split('=')[0]})`,
        { DATABASE_URL: `${URL_WITH_SECRET}?${query}` },
        /must not set session options \((options|application_name)\)/,
      ],
    ),
    [
      'a schema with a quote (injection attempt)',
      { DATABASE_URL: URL_WITH_SECRET, DATABASE_SCHEMA: 'x"; DROP TABLE users; --' },
      /DATABASE_SCHEMA/,
    ],
    ['a schema with a dot', { DATABASE_URL: URL_WITH_SECRET, DATABASE_SCHEMA: 'a.b' }, /DATABASE_SCHEMA/],
    ['a schema starting with a digit', { DATABASE_URL: URL_WITH_SECRET, DATABASE_SCHEMA: '1abc' }, /DATABASE_SCHEMA/],
    [
      'a schema longer than 63 characters',
      { DATABASE_URL: URL_WITH_SECRET, DATABASE_SCHEMA: 'a'.repeat(64) },
      /DATABASE_SCHEMA/,
    ],
    ['an unknown DATABASE_SSL', { DATABASE_URL: URL_WITH_SECRET, DATABASE_SSL: 'yes' }, /DATABASE_SSL must be one of/],
    ['DATABASE_SSL holding the password', { DATABASE_URL: URL_WITH_SECRET, DATABASE_SSL: PASSWORD }, /value not shown/],
    ['a non-numeric pool size', { DATABASE_URL: URL_WITH_SECRET, DATABASE_POOL_MAX: 'ten' }, /DATABASE_POOL_MAX/],
    ['a fractional pool size', { DATABASE_URL: URL_WITH_SECRET, DATABASE_POOL_MAX: '2.5' }, /DATABASE_POOL_MAX/],
    ['a pool size of zero', { DATABASE_URL: URL_WITH_SECRET, DATABASE_POOL_MAX: '0' }, /DATABASE_POOL_MAX/],
    ['a pool size above 500', { DATABASE_URL: URL_WITH_SECRET, DATABASE_POOL_MAX: '501' }, /DATABASE_POOL_MAX/],
  ])('refuses %s without echoing the password', (_, env, message) => {
    const error = configError(env);
    expect(error.message).toMatch(message);
    expect(error.message).not.toContain(PASSWORD);
    expect(error.message).not.toContain('db.internal');
  });

  it('links a missing URL to the database settings, a heading that exists in the docs', () => {
    expect(configError({}).message).toContain(DATABASE_SETTINGS_DOCS_URL);
    const [, route, id] =
      /^https:\/\/docs\.attraccess\.org\/#\/en\/(.+)\?id=(.+)$/.exec(DATABASE_SETTINGS_DOCS_URL) ?? [];
    const page = readFileSync(join(__dirname, '../../../../../docs/en', `${route}.md`), 'utf8');
    const slugs = [...page.matchAll(/^#{2,4} (.+)$/gm)].map(([, heading]) =>
      heading
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .trim()
        .replace(/ +/g, '-'),
    );
    expect(slugs).toContain(id);
  });

  it.each<[string | undefined, DatabaseSslMode]>([
    [undefined, 'off'],
    ['', 'off'],
    ['off', 'off'],
    ['false', 'off'],
    ['0', 'off'],
    ['disable', 'off'],
    ['true', 'require'],
    ['1', 'require'],
    ['require', 'require'],
    ['verify-ca', 'verify-ca'],
    ['VERIFY-FULL', 'verify-full'],
  ])('reads DATABASE_SSL=%p as %s', (value, mode) => {
    expect(parsePostgresConfig({ DATABASE_URL: URL_WITH_SECRET, DATABASE_SSL: value }).ssl).toBe(mode);
  });
});

describe('sslOption', () => {
  it('turns TLS off, encrypts without verification, or verifies the chain with or without the host name', () => {
    expect(sslOption('off')).toBe(false);
    expect(sslOption('require')).toEqual({ rejectUnauthorized: false });
    const verifyCa = sslOption('verify-ca');
    expect(verifyCa).toEqual({ rejectUnauthorized: true, checkServerIdentity: expect.any(Function) });
    // verify-ca checks the chain but accepts any host name on the certificate.
    expect(verifyCa && verifyCa.checkServerIdentity?.()).toBeUndefined();
    expect(sslOption('verify-full')).toEqual({ rejectUnauthorized: true });
    expect(sslOption('verify-full')).not.toHaveProperty('checkServerIdentity');
  });
});

describe('redactDatabaseUrl', () => {
  it.each([
    ['the password in the user info', URL_WITH_SECRET, 'postgres://attraccess@db.internal:5432/attraccess'],
    ['a percent-encoded password', 'postgres://u:p%40ss%2Fword@h/db', 'postgres://u@h/db'],
    [
      'a password query parameter',
      `postgres://u@h:5432/db?password=${PASSWORD}&sslmode=require`,
      'postgres://u@h:5432/db',
    ],
    ['a password in both places', `postgresql://u:${PASSWORD}@h/db?password=${PASSWORD}`, 'postgresql://u@h/db'],
    ['no user info', 'postgres://h/db', 'postgres://h/db'],
  ])('hides %s', (_, url, expected) => {
    const redacted = redactDatabaseUrl(url);
    expect(redacted).toBe(expected);
    expect(redacted).not.toContain(PASSWORD);
    expect(redacted).not.toContain('p%40ss');
  });

  it('says nothing about a URL it cannot parse', () => {
    expect(redactDatabaseUrl(`not a url ${PASSWORD}`)).toBe('(unparsable database url)');
  });
});
