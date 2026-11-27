import { describe, expect, it } from 'vitest';
import { connectedEdges } from './connectedEdges';

describe('connectedEdges', () => {
  it('drops edges whose source or target node is gone', () => {
    const position = { x: 0, y: 0 };
    const nodes = [
      { id: 'nut', position, data: {} },
      { id: 'OK', position, data: {} },
    ];
    const edges = [
      { id: 'success', source: 'nut', target: 'OK' },
      { id: 'failure', source: 'nut', target: 'FAIL' },
      { id: 'orphan', source: 'gone', target: 'OK' },
    ];
    expect(connectedEdges(nodes, edges).map((edge) => edge.id)).toEqual(['success']);
  });
});
