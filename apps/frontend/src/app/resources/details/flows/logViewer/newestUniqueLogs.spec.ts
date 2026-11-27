import { describe, expect, it } from 'vitest';
import type { ResourceFlowLog } from '@attraccess/react-query-client';
import { newestUniqueLogs } from './newestUniqueLogs';

const log = (id: number) => ({ id, flowRunId: 'run', type: 'flow.start' }) as ResourceFlowLog;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => log(from + index));

describe('newestUniqueLogs', () => {
  it('drops duplicates and orders oldest first', () => {
    expect(newestUniqueLogs([log(3), log(1), log(3), log(2)]).map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it('keeps only the newest 2000 of recorded and live entries combined', () => {
    const merged = newestUniqueLogs([...range(1, 1500), ...range(1001, 2500)]);

    expect(merged).toHaveLength(2000);
    expect(merged[0].id).toBe(501);
    expect(merged.at(-1)?.id).toBe(2500);
  });
});
