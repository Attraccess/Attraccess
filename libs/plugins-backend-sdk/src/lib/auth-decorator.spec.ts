import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { SessionOnlyGuard } from './auth-decorator';

describe('SessionOnlyGuard', () => {
  const guard = new SessionOnlyGuard();

  it('rejects API token principals', () => {
    const context = requestContext({ user: { authenticationMethod: 'api-token' } });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('Session authentication required'));
  });

  it('allows session principals', () => {
    const context = requestContext({ user: { authenticationMethod: 'session' } });

    expect(guard.canActivate(context)).toBe(true);
  });
});

function requestContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
