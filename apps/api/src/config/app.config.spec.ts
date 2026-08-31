import { AppEnvSchema, DEFAULT_PLUGIN_DIR, resolveAppVersion, resolvePluginDir } from './app.config';

describe('plugin directory configuration', () => {
  it('defaults PLUGIN_DIR when it is not configured', () => {
    expect(AppEnvSchema.parse({ AUTH_SESSION_SECRET: 'test-secret' }).PLUGIN_DIR).toBe(resolvePluginDir());
  });

  it('uses the configured storage root for the default plugin directory', () => {
    expect(resolvePluginDir({ STORAGE_ROOT: '/custom/storage' })).toBe('/custom/storage/plugins');
  });

  it('uses the default storage root when neither directory is configured', () => {
    expect(resolvePluginDir({})).toBe(DEFAULT_PLUGIN_DIR);
  });

  it('preserves an explicitly configured plugin directory', () => {
    expect(AppEnvSchema.parse({ AUTH_SESSION_SECRET: 'test-secret', PLUGIN_DIR: '/custom/plugins' }).PLUGIN_DIR).toBe(
      '/custom/plugins',
    );
  });
});

describe('resolveAppVersion', () => {
  it('prefers the webpack-injected build-time version over any env var', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: '2.0.0',
          npm_package_version: '0.0.16',
        },
        '1.5.2',
      ),
    ).toBe('1.5.2');
  });

  it('falls back to env.ATTRACCESS_VERSION when build-time version is undefined', () => {
    expect(
      resolveAppVersion({ ATTRACCESS_VERSION: '1.5.2' }, undefined),
    ).toBe('1.5.2');
  });

  it('falls back to env.ATTRACCESS_VERSION when build-time version is the 0.0.0 placeholder', () => {
    expect(
      resolveAppVersion({ ATTRACCESS_VERSION: '1.5.2' }, '0.0.0'),
    ).toBe('1.5.2');
  });

  it('prefers ATTRACCESS_VERSION when set to a real semver', () => {
    expect(resolveAppVersion({ ATTRACCESS_VERSION: '1.5.2' }, undefined)).toBe('1.5.2');
  });

  it('prefers ATTRACCESS_VERSION over npm_package_version', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: '1.5.2',
          npm_package_version: '0.0.16',
        },
        undefined,
      ),
    ).toBe('1.5.2');
  });

  it('falls back to npm_package_version when ATTRACCESS_VERSION is missing', () => {
    expect(resolveAppVersion({ npm_package_version: '1.5.2' }, undefined)).toBe('1.5.2');
  });

  it('returns 0.0.0-dev when build-time + both env vars are missing', () => {
    expect(resolveAppVersion({}, undefined)).toBe('0.0.0-dev');
  });

  it('treats empty strings as missing', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: '',
          npm_package_version: '',
        },
        '',
      ),
    ).toBe('0.0.0-dev');
  });

  it('treats the literal string "undefined" as missing (webpack DefinePlugin edge case)', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: 'undefined',
        },
        'undefined',
      ),
    ).toBe('0.0.0-dev');
  });

  it('treats the literal string "null" as missing', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: 'null',
        },
        undefined,
      ),
    ).toBe('0.0.0-dev');
  });

  it('treats the placeholder "0.0.0" as missing (unreleased version in apps/api/package.json)', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: '0.0.0',
        },
        '0.0.0',
      ),
    ).toBe('0.0.0-dev');
  });

  it('trims whitespace around the value', () => {
    expect(resolveAppVersion({ ATTRACCESS_VERSION: '  1.5.2  ' }, undefined)).toBe('1.5.2');
  });

  it('skips ATTRACCESS_VERSION placeholder and uses npm_package_version fallback', () => {
    expect(
      resolveAppVersion(
        {
          ATTRACCESS_VERSION: '0.0.0',
          npm_package_version: '1.5.2',
        },
        undefined,
      ),
    ).toBe('1.5.2');
  });

  it('keeps prerelease/v-prefixed semver strings verbatim', () => {
    expect(resolveAppVersion({ ATTRACCESS_VERSION: 'v1.5.2-beta.1' }, undefined)).toBe('v1.5.2-beta.1');
  });

  it('defaults to process.env when no argument is given', () => {
    const originalAttra = process.env.ATTRACCESS_VERSION;
    const originalNpm = process.env.npm_package_version;
    try {
      process.env.ATTRACCESS_VERSION = '9.9.9';
      delete process.env.npm_package_version;
      expect(resolveAppVersion(undefined, undefined)).toBe('9.9.9');
    } finally {
      if (originalAttra === undefined) delete process.env.ATTRACCESS_VERSION;
      else process.env.ATTRACCESS_VERSION = originalAttra;
      if (originalNpm === undefined) delete process.env.npm_package_version;
      else process.env.npm_package_version = originalNpm;
    }
  });
});
