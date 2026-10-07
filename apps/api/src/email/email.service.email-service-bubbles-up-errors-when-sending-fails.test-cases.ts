import { EmailServiceTestScope } from './email.service.spec';
export function registerEmailServiceBubblesUpErrorsWhenSendingFails(scope: EmailServiceTestScope): void {
  it('bubbles up errors when sending fails', async () => {
    const { service, sendMail } = scope.setup();
    (sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = scope.makeUser();

    await expect(service.sendVerificationEmail(user, 'tok')).rejects.toThrow('SMTP down');
  });
}
