import { describe, expect, it } from 'vitest';
import { groupValidationErrorsByNode } from './groupValidationErrorsByNode';

describe('groupValidationErrorsByNode', () => {
  it('keeps every error of every node, in order, without the node id', () => {
    expect(
      groupValidationErrorsByNode([
        { nodeId: 'a', field: 'meterId', code: 'required', message: 'This field is required.' },
        { nodeId: 'b', field: 'url', code: 'invalid', message: 'Invalid URL' },
        { nodeId: 'a', field: 'timeoutSeconds', message: 'Too big' },
      ]),
    ).toEqual({
      a: [
        { field: 'meterId', code: 'required', message: 'This field is required.' },
        { field: 'timeoutSeconds', code: undefined, message: 'Too big' },
      ],
      b: [{ field: 'url', code: 'invalid', message: 'Invalid URL' }],
    });
  });

  it('returns no entries for a clean flow, so fixed nodes lose their old errors', () => {
    expect(groupValidationErrorsByNode([])).toEqual({});
  });
});
