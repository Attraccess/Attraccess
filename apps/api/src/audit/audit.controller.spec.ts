import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';

describe('AuditController', () => {
  it('passes validated project action and prefix filters to the audit query service', async () => {
    const audit = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const controller = new AuditController(audit as unknown as AuditQueryService);

    await controller.list({ domain: 'project', action: 'project.member.added', eventPrefix: 'project.' });

    expect(audit.list).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'project',
        action: 'project.member.added',
        eventPrefix: 'project.',
      }),
    );
  });

  it('rejects an unrecognized project action filter', async () => {
    const controller = new AuditController({ list: jest.fn() } as unknown as AuditQueryService);

    await expect(controller.list({ action: 'project.member.promoted' })).rejects.toThrow();
  });
});
