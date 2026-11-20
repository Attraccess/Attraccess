import type { ResourceRecord, UsageSession } from '@attraccess/application-models';
import { toResourceDto } from './resource.dto';

describe('toResourceDto', () => {
  it('reduces the user of an embedded usage to the public profile', () => {
    const usage = {
      id: 7,
      resourceId: 1,
      userId: 3,
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: null,
      user: {
        id: 3,
        username: 'ada',
        email: 'ada@example.com',
        passwordResetToken: 'reset-hash',
        nfcKeySeedToken: 'seed',
      },
    } as unknown as UsageSession;
    const record = { id: 1, name: 'Laser', usages: [usage] } as unknown as ResourceRecord;

    const json = JSON.stringify(toResourceDto(record));

    expect(json).toContain('"username":"ada"');
    expect(json).not.toContain('ada@example.com');
    expect(json).not.toContain('reset-hash');
    expect(json).not.toContain('seed');
  });
});
