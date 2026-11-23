import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { FormImageViewerGuard } from './form-image-viewer.guard';

describe('FormImageViewerGuard', () => {
  const context = {} as never;
  const guardFor = (canActivate: jest.Mock) => new FormImageViewerGuard({ canActivate } as unknown as DualAuthGuard);

  it('lets a signed-in viewer through', async () => {
    await expect(guardFor(jest.fn().mockResolvedValue(true)).canActivate(context)).resolves.toBe(true);
  });

  it('answers a missing or invalid sign-in with 404, like a viewer who may not see the image', async () => {
    const guard = guardFor(jest.fn().mockRejectedValue(new UnauthorizedException('x')));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not hide other failures, such as an unavailable session store', async () => {
    const guard = guardFor(jest.fn().mockRejectedValue(new ForbiddenException()));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
