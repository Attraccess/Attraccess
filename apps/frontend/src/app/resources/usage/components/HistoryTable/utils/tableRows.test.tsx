import { describe, expect, it } from 'vitest';
import { isValidElement } from 'react';
import { Resource, ResourceUsage } from '@attraccess/react-query-client';
import { generateRowCells } from './tableRows';

describe('generateRowCells', () => {
  it('renders the supervisor as a mini user in machine history rows', () => {
    const cells = generateRowCells(
      {
        id: 1,
        startTime: '2026-06-13T10:00:00.000Z',
        endTime: '2026-06-13T11:00:00.000Z',
        usageInMinutes: 60,
        supervisorUser: { id: 2, username: 'supervisor' },
      } as ResourceUsage,
      ((key: string) => key) as never,
      { type: 'machine' } as Resource,
      false,
      false,
    );

    const supervisorCell = cells.find((cell) => cell.key === 'supervisor-1');
    const endTimeCell = cells.find((cell) => cell.key === 'end-1');

    const supervisor = supervisorCell?.props.children;
    if (!isValidElement<{ variant: string }>(supervisor)) throw new Error('Missing supervisor element');
    expect(supervisor.props.variant).toBe('mini');
    expect(endTimeCell?.props.className).toContain('hidden lg:table-cell');
  });
});
