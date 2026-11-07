import { ConfigError, isLoopbackHost, loadConfig, normaliseAllowedHost } from './config';
import { TEST_TOKEN, configWith } from './testing/config';

const TOKEN = TEST_TOKEN;
const OTHER = 'other-token-0123456789abcdef0123456789abcdef';
const base = { MATTER_SIDECAR_AUTH_TOKEN: TOKEN };

function problemsOf(env: Record<string, string>, files: Record<string, string> = {}): string[] {
  try {
    loadConfig(env, (path) => {
      if (path in files) return files[path];
      throw new Error('ENOENT');
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies the documented defaults and binds loopback only', () => {
    expect(loadConfig(base)).toEqual({
      host: '127.0.0.1',
      port: 8581,
      authTokens: [TOKEN],
      allowedHosts: [],
      tls: null,
      insecureRemote: false,
      maxMessageBytes: 1024 * 1024,
      requestDeadlineMs: 10_000,
      shutdownGraceMs: 5_000,
      replayMaxEvents: 1_000,
      replayMaxAgeMs: 300_000,
      clientQueueBytes: 1024 * 1024,
      maxClients: 64,
      firstMessageTimeoutMs: 30_000,
    });
  });

  it('reads overrides from the environment and ignores the old MATTER_SIDECAR_HOST', () => {
    const config = loadConfig({
      ...base,
      MATTER_SIDECAR_PORT: '0',
      MATTER_SIDECAR_REPLAY_MAX_EVENTS: '5',
      MATTER_SIDECAR_HOST: '0.0.0.0',
    });
    expect(config).toMatchObject({ port: 0, replayMaxEvents: 5, host: '127.0.0.1' });
  });

  it('fails before listening with an actionable list of problems', () => {
    expect(problemsOf({ ...base, MATTER_SIDECAR_PORT: 'abc' })[0]).toContain('MATTER_SIDECAR_PORT');
  });

  it('treats an empty or blank variable as unset instead of coercing it to 0', () => {
    expect(
      loadConfig({
        ...base,
        MATTER_SIDECAR_PORT: '',
        MATTER_SIDECAR_REQUEST_DEADLINE_MS: '  ',
        MATTER_SIDECAR_BIND_HOST: '',
        MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS: '',
      }),
    ).toMatchObject({ port: 8581, requestDeadlineMs: 10_000, host: '127.0.0.1', authTokens: [TOKEN] });
  });

  it('configWith binds an ephemeral port and carries the test token', () => {
    expect(configWith({ replayMaxEvents: 3 })).toMatchObject({ port: 0, replayMaxEvents: 3, authTokens: [TOKEN] });
  });
});

describe('service token', () => {
  it('refuses to start without a token and names the variable', () => {
    expect(problemsOf({}).join()).toMatch(/MATTER_SIDECAR_AUTH_TOKEN: a service token is required/);
  });

  it.each([
    ['short', 'a'.repeat(31)],
    ['too long', 'a'.repeat(513)],
    ['non-ascii', `${'a'.repeat(40)}é`],
    ['inner space', `${'a'.repeat(20)} ${'b'.repeat(20)}`],
  ])('rejects a %s token', (_name, token) => {
    expect(problemsOf({ MATTER_SIDECAR_AUTH_TOKEN: token }).join()).toMatch(
      /MATTER_SIDECAR_AUTH_TOKEN: the token must be 32-512/,
    );
  });

  it('reads tokens from files and trims surrounding whitespace', () => {
    const config = loadConfig(
      { MATTER_SIDECAR_AUTH_TOKEN_FILE: '/run/t', MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS_FILE: '/run/p' },
      (path) => (path === '/run/t' ? `${TOKEN}\n` : `  ${OTHER}\r\n`),
    );
    expect(config.authTokens).toEqual([TOKEN, OTHER]);
  });

  it('accepts the previous token from the environment while rotating', () => {
    expect(loadConfig({ ...base, MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS: OTHER }).authTokens).toEqual([TOKEN, OTHER]);
  });

  it.each(['MATTER_SIDECAR_AUTH_TOKEN', 'MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS'])(
    'rejects both %s and %s_FILE',
    (name) => {
      const env = { ...base, [name]: name.endsWith('PREVIOUS') ? OTHER : TOKEN, [`${name}_FILE`]: '/run/t' };
      expect(problemsOf(env, { '/run/t': TOKEN }).join()).toContain(`${name} and ${name}_FILE are both set`);
    },
  );

  it('names the _FILE variable when the file is unreadable or holds an invalid token', () => {
    expect(problemsOf({ MATTER_SIDECAR_AUTH_TOKEN_FILE: '/missing' }).join()).toContain(
      'MATTER_SIDECAR_AUTH_TOKEN_FILE: cannot read',
    );
    expect(problemsOf({ MATTER_SIDECAR_AUTH_TOKEN_FILE: '/short' }, { '/short': 'abc' }).join()).toContain(
      'MATTER_SIDECAR_AUTH_TOKEN_FILE: the token must be',
    );
  });

  it('never puts a token value into an error message', () => {
    const text = problemsOf({ MATTER_SIDECAR_AUTH_TOKEN: 'secret-but-too-short' }).join();
    expect(text).not.toContain('secret-but-too-short');
  });
});

describe('bind, allowed hosts and TLS', () => {
  const files = { '/c': 'CERT', '/k': 'KEY' };
  const remote = {
    ...base,
    MATTER_SIDECAR_BIND_HOST: '0.0.0.0',
    MATTER_SIDECAR_ALLOWED_HOSTS: 'Matter.Internal, other',
  };

  it('recognizes loopback binds', () => {
    for (const host of ['127.0.0.1', '127.1.2.3', 'localhost', '::1', '[::1]']) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ['0.0.0.0', '::', '192.168.1.5', 'matter.internal']) expect(isLoopbackHost(host)).toBe(false);
  });

  it('refuses a non-loopback bind without allowed hosts', () => {
    const env = { ...base, MATTER_SIDECAR_BIND_HOST: '0.0.0.0', MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'true' };
    expect(problemsOf(env).join()).toContain('MATTER_SIDECAR_ALLOWED_HOSTS: required');
  });

  it('refuses a non-loopback bind without TLS unless the insecure flag is set', () => {
    expect(problemsOf(remote).join()).toMatch(/MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true/);
    const config = loadConfig({ ...remote, MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'TRUE' });
    expect(config).toMatchObject({
      host: '0.0.0.0',
      allowedHosts: ['matter.internal', 'other'],
      insecureRemote: true,
      tls: null,
    });
  });

  it('accepts a non-loopback bind with TLS and does not call it insecure', () => {
    const config = loadConfig(
      { ...remote, MATTER_SIDECAR_TLS_CERT_FILE: '/c', MATTER_SIDECAR_TLS_KEY_FILE: '/k' },
      (path) => files[path as keyof typeof files],
    );
    expect(config.insecureRemote).toBe(false);
    expect(config.tls?.cert.toString()).toBe('CERT');
  });

  it.each([['MATTER_SIDECAR_TLS_CERT_FILE'], ['MATTER_SIDECAR_TLS_KEY_FILE']])(
    'refuses only %s without its pair',
    (name) => {
      const missing =
        name === 'MATTER_SIDECAR_TLS_CERT_FILE' ? 'MATTER_SIDECAR_TLS_KEY_FILE' : 'MATTER_SIDECAR_TLS_CERT_FILE';
      expect(problemsOf({ ...base, [name]: '/c' }, files).join()).toContain(`${missing}: set both`);
    },
  );

  it('refuses unreadable TLS files and a bad insecure flag', () => {
    expect(
      problemsOf({ ...base, MATTER_SIDECAR_TLS_CERT_FILE: '/x', MATTER_SIDECAR_TLS_KEY_FILE: '/y' }).join(),
    ).toContain('cannot read the certificate or key file');
    expect(problemsOf({ ...base, MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'yes' }).join()).toContain(
      'MATTER_SIDECAR_ALLOW_INSECURE_REMOTE',
    );
  });

  it('normalises allowed hosts to the form a Host header carries them', () => {
    const config = loadConfig({
      ...remote,
      MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'true',
      MATTER_SIDECAR_ALLOWED_HOSTS: 'fd00::5, [FD00::6], Matter.LAN, matter.lan., 192.168.1.5,,',
    });
    expect(config.allowedHosts).toEqual(['[fd00::5]', '[fd00::6]', 'matter.lan', '192.168.1.5']);
  });

  it.each([
    ['a port', 'host:8581'],
    ['an IPv4 address with a port', '192.168.1.5:8581'],
    ['a bracketed IPv6 address with a port', '[fd00::5]:8581'],
    ['a scheme', 'https://matter.lan'],
    ['a path', 'matter.lan/prefix'],
    ['user info', 'user@matter.lan'],
    ['an unbalanced bracket', '[fd00::5'],
  ])('rejects an allowed host with %s and names the variable', (_name, entry) => {
    const problems = problemsOf({
      ...remote,
      MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: 'true',
      MATTER_SIDECAR_ALLOWED_HOSTS: `ok, ${entry}`,
    });
    expect(problems.join()).toContain(`MATTER_SIDECAR_ALLOWED_HOSTS: "${entry}" is not a host name`);
  });

  it('normalises one allowed host entry', () => {
    expect(normaliseAllowedHost(' FD00::5 ')).toBe('[fd00::5]');
    expect(normaliseAllowedHost('[::1]')).toBe('[::1]');
    expect(normaliseAllowedHost('Matter.LAN.')).toBe('matter.lan');
    expect(normaliseAllowedHost('host:8581')).toBeNull();
    expect(normaliseAllowedHost('[not-an-address]')).toBeNull();
  });

  it('keeps loopback binds free of any extra requirement', () => {
    expect(loadConfig({ ...base, MATTER_SIDECAR_BIND_HOST: 'localhost' })).toMatchObject({
      host: 'localhost',
      insecureRemote: false,
    });
  });
});
