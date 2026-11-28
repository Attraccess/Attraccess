import { NotFoundException } from '@nestjs/common';
import { ResourceListVisibleInterceptor } from './resource-list-visible.interceptor';

describe('ResourceListVisibleInterceptor', () => {
  const run = async (request: object, canSee: boolean) => {
    const visibility = { canSee: jest.fn(async () => canSee) };
    const handle = jest.fn(() => 'handled' as never);
    const interceptor = new ResourceListVisibleInterceptor(visibility as never);
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    const result = interceptor.intercept(context as never, { handle });
    return { result, handle, visibility };
  };

  it('answers 404 for a hidden machine, whatever the route calls its id', async () => {
    for (const params of [{ resourceId: '5' }, { id: '5' }]) {
      const { result, handle } = await run({ user: { id: 1 }, params }, false);
      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      expect(handle).not.toHaveBeenCalled();
    }
  });

  it('lets a visible machine through', async () => {
    const { result, handle, visibility } = await run({ user: { id: 1 }, params: { resourceId: '5' } }, true);
    expect(await result).toBe('handled');
    expect(handle).toHaveBeenCalled();
    expect(visibility.canSee).toHaveBeenCalledWith({ id: 1 }, 5);
  });

  it.each(['abc', '0x5', '1e1', '5.0', ' 5', ''])(
    'passes the malformed id %p on to the route pipe, which answers 400',
    async (resourceId) => {
      const { result, visibility } = await run({ user: { id: 1 }, params: { resourceId } }, false);
      expect(await result).toBe('handled');
      expect(visibility.canSee).not.toHaveBeenCalled();
    },
  );

  it('passes a request without a user on: the route sign-in has refused it already', async () => {
    const { result, visibility } = await run({ params: { resourceId: '5' } }, false);
    expect(await result).toBe('handled');
    expect(visibility.canSee).not.toHaveBeenCalled();
  });
});
