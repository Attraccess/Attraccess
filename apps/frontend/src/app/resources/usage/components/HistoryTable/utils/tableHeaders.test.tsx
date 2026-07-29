import { describe, expect, it } from 'vitest';
import { Resource } from '@attraccess/react-query-client';
import { generateHeaderColumns } from './tableHeaders';

describe('generateHeaderColumns', () => {
  it('prioritizes the compact supervisor column over end time on tablet widths', () => {
    const columns = generateHeaderColumns(
      ((key: string) => key) as never,
      { type: 'machine' } as Resource,
      true,
      true,
    );

    const endTimeColumn = columns.find((column) => column.key === 'endTime');
    const supervisorColumn = columns.find((column) => column.key === 'supervisor');

    expect(endTimeColumn?.props.className).toContain('hidden lg:table-cell');
    expect(supervisorColumn?.props.className).toContain('hidden md:table-cell');
  });
});
