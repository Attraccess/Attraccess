import { ApiError } from '@attraccess/react-query-client';
import { describe, expect, it } from 'vitest';
import { getDiscoveryErrorMessage } from './discoveryError';

const apiError = (body: unknown, status = 502) =>
  new ApiError(
    { method: 'GET', url: '/api/auth/sso/discovery/keycloak' },
    { url: '/api/auth/sso/discovery/keycloak', ok: false, status, statusText: 'Bad Gateway', body },
    'Bad Gateway',
  );

describe('getDiscoveryErrorMessage', () => {
  it('returns the server message of a JSON error body', () => {
    const message = 'Discovery URL could not be reached: https://idp.example.test (ECONNREFUSED)';
    expect(getDiscoveryErrorMessage(apiError({ statusCode: 502, message }))).toBe(message);
  });

  it('joins a validation message array', () => {
    expect(getDiscoveryErrorMessage(apiError({ message: ['host must be a URL', ' realm is required '] }, 400))).toBe(
      'host must be a URL, realm is required',
    );
  });

  it.each([
    ['an empty message', { message: '' }],
    ['a whitespace message', { message: '   ' }],
    ['an empty message array', { message: [] }],
    ['a message array without text', { message: [' ', 42] }],
    ['a non-string message', { message: 502 }],
    ['a body without message', { statusCode: 502, error: 'Bad Gateway' }],
    ['an HTML proxy page', '<html><head><title>502 Bad Gateway</title></head><body>Bad Gateway</body></html>'],
    ['a plain-text proxy page', 'Bad Gateway'],
    ['no body', undefined],
    ['a null body', null],
  ])('ignores %s', (_, body) => {
    expect(getDiscoveryErrorMessage(apiError(body))).toBeUndefined();
  });

  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['a plain error', new Error('Failed to fetch configuration')],
    ['a string', 'Bad Gateway'],
    ['an object with a message body', { body: { message: 'not an ApiError' } }],
    ['undefined', undefined],
  ])('ignores %s that is not an API error', (_, error) => {
    expect(getDiscoveryErrorMessage(error)).toBeUndefined();
  });
});
