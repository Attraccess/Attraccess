import { User } from '@attraccess/database-entities';
import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerLoadsAFullRecipientBeforeSendingAccessChangeEmailForIdOnlyNotificationReCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('loads a full recipient before sending access-change email for id-only notification recipients', async () => {
    const { service, sendMail, userRepository } = fixture.setup();
    userRepository.findOne.mockResolvedValue(
      fixture.makeUser({ id: 7, username: 'riley', email: 'riley@example.com' }),
    );

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
