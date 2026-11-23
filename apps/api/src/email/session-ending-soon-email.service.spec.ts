import { EmailTemplateType, type NotificationRecipient } from '@attraccess/application-models';
import { EmailService } from './email.service';
import { SessionEndingSoonEmailService } from './session-ending-soon-email.service';

describe('SessionEndingSoonEmailService', () => {
  const base = {
    user: { username: 'bob', displayName: 'bob', email: 'bob@example.com', id: 2 },
    host: { frontend: 'https://attraccess.example', backend: 'https://api.attraccess.example' },
    url: 'https://attraccess.example',
  };
  let emailService: { getBaseContext: jest.Mock; sendEmail: jest.Mock };
  let service: SessionEndingSoonEmailService;
  const recipient = { id: 2, username: 'bob', email: 'bob@example.com' } as NotificationRecipient;
  const resource = { id: 4, name: 'Laser' };

  beforeEach(() => {
    emailService = {
      getBaseContext: jest.fn().mockResolvedValue(base),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    service = new SessionEndingSoonEmailService(emailService as unknown as EmailService);
  });

  it('sends nothing to a recipient without an email address', async () => {
    await service.send({ ...recipient, email: null } as unknown as NotificationRecipient, resource, {
      id: 10,
      endsAt: new Date(),
      minutesLeft: 5,
    });

    expect(emailService.getBaseContext).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('links the resource page on the frontend and sends the end as an ISO time', async () => {
    const endsAt = new Date('2026-06-04T12:15:00.000Z');

    await service.send(recipient, { ...resource, extra: 'ignored' } as typeof resource, {
      id: 10,
      endsAt,
      minutesLeft: 15,
    });

    expect(emailService.getBaseContext).toHaveBeenCalledWith(recipient);
    expect(emailService.sendEmail).toHaveBeenCalledWith(recipient, EmailTemplateType.RESOURCE_SESSION_ENDING_SOON, {
      ...base,
      resource: { id: 4, name: 'Laser', url: 'https://attraccess.example/resources/4' },
      session: { id: 10, endsAt: '2026-06-04T12:15:00.000Z', minutesLeft: 15 },
    });
  });

  it('passes an end that is already a string through unchanged', async () => {
    await service.send(recipient, resource, { id: 10, endsAt: '2026-06-04T12:15:00.000Z', minutesLeft: 5 });

    expect(emailService.sendEmail.mock.calls[0][2].session.endsAt).toBe('2026-06-04T12:15:00.000Z');
  });
});
