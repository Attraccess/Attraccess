import { auditActorFields } from './audit-actor';

describe('auditActorFields', () => {
  it('records an API token with its id', () => {
    expect(auditActorFields({ id: 3, authenticationMethod: 'api-token', apiTokenId: 9 })).toEqual({
      id: 3,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('records an MCP OAuth caller as such, without a token id', () => {
    expect(auditActorFields({ id: 3, authenticationMethod: 'mcp-oauth' })).toEqual({
      id: 3,
      authenticationMethod: 'mcp-oauth',
    });
  });

  it.each([undefined, 'session' as const])('records %s as a session', (authenticationMethod) => {
    expect(auditActorFields({ id: 3, authenticationMethod })).toEqual({ id: 3, authenticationMethod: 'session' });
  });

  it('does not treat an API-token actor without a token id as a token', () => {
    expect(auditActorFields({ id: 3, authenticationMethod: 'api-token' })).toEqual({
      id: 3,
      authenticationMethod: 'session',
    });
  });
});
