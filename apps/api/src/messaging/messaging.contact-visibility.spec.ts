import { ForbiddenException } from '@nestjs/common';
import { MessagingController } from './messaging.controller';

/** Contacting the current user names them, so it follows the activity visibility rule (ATT-1149). */
describe('MessagingController.contactResourceHolder visibility', () => {
  const req = { user: { id: 10, effectivePermissions: new Set(['resources.read']) } } as never;
  const setup = (access: 'full' | 'anonymous' | 'none') => {
    const messaging = {
      resolveResourceHolder: jest.fn(async () => ({ id: 77 })),
      getOrCreateConversation: jest.fn(async () => ({ id: 'c1' })),
    };
    const visibility = { resolve: jest.fn(async () => access) };
    return {
      messaging,
      controller: new MessagingController(messaging as never, {} as never, {} as never, visibility as never),
    };
  };

  it.each(['none', 'anonymous'] as const)(
    'refuses %s viewers before looking up the holder, so free and in-use machines answer alike',
    async (access) => {
      const { controller, messaging } = setup(access);
      await expect(controller.contactResourceHolder(1, req)).rejects.toBeInstanceOf(ForbiddenException);
      expect(messaging.resolveResourceHolder).not.toHaveBeenCalled();
      expect(messaging.getOrCreateConversation).not.toHaveBeenCalled();
    },
  );

  it('opens the conversation for viewers who may see who is using the machine', async () => {
    const { controller, messaging } = setup('full');
    await expect(controller.contactResourceHolder(1, req)).resolves.toMatchObject({ conversationId: 'c1' });
    expect(messaging.getOrCreateConversation).toHaveBeenCalledWith(10, 77);
  });
});
