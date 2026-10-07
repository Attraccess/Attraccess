import { User } from '@attraccess/database-entities';
import { EmailServiceTestScope } from './email.service.spec';
export function registerEmailServiceLoadsAFullRecipientBeforeSendingAccessChangeEmailForIdOnlyNotificationRecipients(
  scope: EmailServiceTestScope,
): void {
  it('loads a full recipient before sending access-change email for id-only notification recipients', async () => {
    const { service, sendMail, userRepository } = scope.setup();
    userRepository.findOne.mockResolvedValue(scope.makeUser({ id: 7, username: 'riley', email: 'riley@example.com' }));

    await service.sendAccessChangeEmail({ id: 7 } as User, {
      title: 'Your group access changed',
      body: 'You received an introduction for group #5.',
      url: '/resource-groups/5',
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('riley@example.com');
    expect(callArg.html).toContain('Hello riley');
    expect(callArg.html).toContain('https://frontend.example/resource-groups/5');
  });
}
