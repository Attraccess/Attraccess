import { ConfigError } from './config';
import { isOperational, startupFailure } from './startup-failure';

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('startupFailure', () => {
  it('tells the operator which variables to fix for a configuration error', () => {
    expect(startupFailure(new ConfigError(['MATTER_SIDECAR_PORT: bad']))).toMatch(
      /MATTER_SIDECAR_PORT: bad\. Fix the MATTER_SIDECAR_\* environment variables/,
    );
  });

  it('names the port setting when the port is taken', () => {
    expect(startupFailure(withCode('listen EADDRINUSE', 'EADDRINUSE'))).toBe(
      'could not start (listen EADDRINUSE). Set MATTER_SIDECAR_PORT to a free port. Only the sidecar stopped; Attraccess is unaffected.',
    );
  });

  it('describes other failures without a hint', () => {
    expect(startupFailure(new Error('boom'))).toBe(
      'could not start (boom). Only the sidecar stopped; Attraccess is unaffected.',
    );
    expect(startupFailure('nope')).toMatch(/could not start \(unknown error\)/);
  });
});

describe('isOperational', () => {
  it('treats configuration and system errors as operational, anything else as unexpected', () => {
    expect(isOperational(new ConfigError([]))).toBe(true);
    expect(isOperational(withCode('x', 'EACCES'))).toBe(true);
    expect(isOperational(new Error('bug'))).toBe(false);
    expect(isOperational('text')).toBe(false);
  });
});
