import 'reflect-metadata';
import { validate } from 'class-validator';
import {
  MAX_REPORT_DURATION_MS,
  MAX_RESOURCE_IDS_PER_REPORT,
  ResourceOperatingDurationsDto,
} from './resourceOperatingDurations.dto';

describe('ResourceOperatingDurationsDto', () => {
  it('rejects report requests containing more than the supported number of resource IDs', async () => {
    const dto = Object.assign(new ResourceOperatingDurationsDto(), {
      resourceIds: Array.from({ length: MAX_RESOURCE_IDS_PER_REPORT + 1 }, (_, index) => index + 1),
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-01-02T00:00:00.000Z'),
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'resourceIds', constraints: { arrayMaxSize: expect.any(String) } }),
      ]),
    );
  });

  it('rejects report date ranges longer than 31 days', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const dto = Object.assign(new ResourceOperatingDurationsDto(), {
      resourceIds: [1],
      start,
      end: new Date(start.getTime() + MAX_REPORT_DURATION_MS + 1),
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'end', constraints: { reportDateRange: expect.any(String) } }),
      ]),
    );
  });
});
