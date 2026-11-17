import { describe, expect, it } from 'vitest';
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

    const rowCells = cells as Array<{
      key: string;
      props: { children: { props: { variant: string } }; className: string };
    }>;
    const supervisorCell = rowCells.find((cell) => cell.key === 'supervisor-1');
    const endTimeCell = rowCells.find((cell) => cell.key === 'end-1');

    expect(supervisorCell?.props.children.props.variant).toBe('mini');
    expect(endTimeCell?.props.className).toContain('hidden lg:table-cell');
  });

  it.each([
    [true, 'rows.door.action.door.open'],
    [false, 'rows.door.action.door.unlock'],
  ])('labels a door unlock on an access-only door (%s) as %s', (accessOnly, label) => {
    const cells = generateRowCells(
      { id: 3, startTime: '2026-06-13T10:00:00.000Z', usageAction: 'door.unlock' } as ResourceUsage,
      ((key: string) => key) as never,
      { type: 'door', accessOnly } as Resource,
      false,
      false,
    ) as Array<{ key: string; props: { children: { props: { children: unknown[] } } } }>;

    const actionCell = cells.find((cell) => cell.key === 'action-3');

    expect(actionCell?.props.children.props.children).toContain(label);
  });
});
