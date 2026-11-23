import { ForbiddenException } from '@nestjs/common';
import { MessageReferenceType } from '@attraccess/application-models';
import { MessagingController } from './messaging.controller';
import { ResourceListVisibleInterceptor } from '../resources/visibility/resource-list-visible.interceptor';

/**
 * Contacting the current user names them, so it follows the activity visibility rule (ATT-1149). A machine hidden
 * by the machine list rule (ATT-843) answers like one that does not exist, before the activity rule.
 */
describe('MessagingController.contactResourceHolder visibility', () => {
  const req = { user: { id: 10, effectivePermissions: new Set(['resources.read']) } } as never;
  const setup = (access: 'full' | 'anonymous' | 'none', canSee = true) => {
    const messaging = {
      resolveResourceHolder: jest.fn(async () => ({ id: 77 })),
      getOrCreateConversation: jest.fn(async () => ({ id: 'c1' })),
      sendMessage: jest.fn(async () => ({ id: 1 })),
    };
    const visibility = { resolve: jest.fn(async () => access) };
    const listVisibility = { canSee: jest.fn(async () => canSee) };
    return {
      messaging,
      visibility,
      listVisibility,
      controller: new MessagingController(
        messaging as never,
        {} as never,
        {} as never,
        visibility as never,
        listVisibility as never,
      ),
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

  it('runs the machine list interceptor on the contact route, so a hidden machine answers 404 first', () => {
    const interceptors = Reflect.getMetadata('__interceptors__', MessagingController.prototype.contactResourceHolder);
    expect(interceptors).toContain(ResourceListVisibleInterceptor);
  });

  describe('sendMessage with a machine reference', () => {
    const dto = { content: 'hi', referenceType: MessageReferenceType.RESOURCE, referenceId: 5 };

    it('labels a reference to a visible machine', async () => {
      const { controller, messaging, listVisibility } = setup('full', true);
      await controller.sendMessage(3, dto, req);
      expect(listVisibility.canSee).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }), 5);
      expect(messaging.sendMessage).toHaveBeenCalledWith(
        3,
        10,
        'hi',
        { referenceType: 'RESOURCE', referenceId: 5 },
        {
          labelReference: true,
        },
      );
    });

    it('stores a reference to a hidden machine without its name, like one to a machine that does not exist', async () => {
      const { controller, messaging } = setup('full', false);
      await controller.sendMessage(3, dto, req);
      expect(messaging.sendMessage).toHaveBeenCalledWith(
        3,
        10,
        'hi',
        { referenceType: 'RESOURCE', referenceId: 5 },
        {
          labelReference: false,
        },
      );
    });

    it('does not ask the machine rule for other references', async () => {
      const { controller, listVisibility, messaging } = setup('full', false);
      await controller.sendMessage(3, { content: 'hi' }, req);
      expect(listVisibility.canSee).not.toHaveBeenCalled();
      expect(messaging.sendMessage).toHaveBeenCalledWith(3, 10, 'hi', undefined, { labelReference: true });
    });
  });
});
