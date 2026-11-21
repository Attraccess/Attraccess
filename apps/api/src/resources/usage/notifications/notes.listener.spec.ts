import type { ResourceNotificationRecipient } from '@attraccess/application-models';
import { ResourceUsageNoteNotificationListener } from './notes.listener';
import { ResourceUsageNoteAddedEvent } from '../events/resource-usage.events';
import { NotificationCategory } from '../../../notifications/notification-types';

type Recipient = ResourceNotificationRecipient;

describe('ResourceUsageNoteNotificationListener', () => {
  let listener: ResourceUsageNoteNotificationListener;
  let recipients: { findResource: jest.Mock; findUsersByIds: jest.Mock; findIntroducerUsers: jest.Mock };
  let notifications: { dispatch: jest.Mock };
  let rbacService: { getUserIdsWithPermission: jest.Mock };

  const RESOURCE_ID = 7;
  const AUTHOR_ID = 1;

  const buildEvent = () =>
    new ResourceUsageNoteAddedEvent(RESOURCE_ID, 'Bed needs leveling', 'end', { id: AUTHOR_ID, username: 'alice' });

  const setAdmins = (admins: Recipient[]) => {
    rbacService.getUserIdsWithPermission.mockResolvedValue(admins.map((user) => user.id));
    recipients.findUsersByIds.mockResolvedValue(admins);
  };

  beforeEach(() => {
    recipients = {
      findResource: jest.fn().mockResolvedValue({ id: RESOURCE_ID, name: 'Laser Cutter', groupIds: [] }),
      findUsersByIds: jest.fn().mockResolvedValue([]),
      findIntroducerUsers: jest.fn().mockResolvedValue([]),
    };
    rbacService = { getUserIdsWithPermission: jest.fn().mockResolvedValue([]) };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    listener = new ResourceUsageNoteNotificationListener(recipients, notifications as never, rbacService as never);
  });

  it('emails introducers and admins, excluding the note author and deduping', async () => {
    setAdmins([
      { id: 2, email: 'admin@example.com' } as Recipient,
      { id: AUTHOR_ID, email: 'alice@example.com' } as Recipient, // author also admin -> excluded
    ]);
    recipients.findIntroducerUsers.mockResolvedValue([
      { id: 3, email: 'intro@example.com' },
      { id: 2, email: 'admin@example.com' }, // dup of admin -> deduped
    ]);

    await listener.handleNoteAdded(buildEvent());

    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.recipients.map((user: Recipient) => user.id).sort()).toEqual([2, 3]);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.RESOURCE_USAGE_NOTES,
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/resources/7/usage',
      }),
    );

    const enUser = { locale: 'en' };
    expect(request.title(enUser)).toBe('Usage note added for Laser Cutter');
    expect(request.body(enUser)).toBe('alice: Bed needs leveling');
  });

  it('names the note author by display name in the push text and the email', async () => {
    recipients.findIntroducerUsers.mockResolvedValue([{ id: 3, email: 'intro@example.com' }]);

    await listener.handleNoteAdded(
      new ResourceUsageNoteAddedEvent(RESOURCE_ID, 'Bed needs leveling', 'end', {
        id: AUTHOR_ID,
        username: 'alice',
        firstName: 'Alice',
        lastName: null,
      }),
    );

    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.body({ locale: 'en' })).toBe('Alice: Bed needs leveling');
  });

  it('skips users without an email', async () => {
    recipients.findIntroducerUsers.mockResolvedValue([{ id: 3, email: null }]);

    await listener.handleNoteAdded(buildEvent());

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the resource is missing', async () => {
    recipients.findResource.mockResolvedValue(null);

    await listener.handleNoteAdded(buildEvent());

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('includes group introducers when the resource belongs to groups', async () => {
    recipients.findResource.mockResolvedValue({ id: RESOURCE_ID, name: 'Laser Cutter', groupIds: [9] });
    recipients.findIntroducerUsers.mockResolvedValue([{ id: 4, email: 'group@example.com' }]);

    await listener.handleNoteAdded(buildEvent());

    expect(recipients.findIntroducerUsers).toHaveBeenCalledWith(RESOURCE_ID, [9]);
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });
});
