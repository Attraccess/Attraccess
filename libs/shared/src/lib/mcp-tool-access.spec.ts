import { mcpToolAllowed } from './mcp-tool-access';

describe('mcpToolAllowed', () => {
  const held = new Set(['a', 'b']);

  it('allows an empty requirement for any caller', () => {
    expect(mcpToolAllowed({ all: [], any: [] }, new Set())).toBe(true);
  });

  it('needs every key of `all`', () => {
    expect(mcpToolAllowed({ all: ['a', 'b'], any: [] }, held)).toBe(true);
    expect(mcpToolAllowed({ all: ['a', 'c'], any: [] }, held)).toBe(false);
  });

  it('needs one key of `any`', () => {
    expect(mcpToolAllowed({ all: [], any: ['c', 'b'] }, held)).toBe(true);
    expect(mcpToolAllowed({ all: [], any: ['c', 'd'] }, held)).toBe(false);
  });

  it('needs both parts when both are given', () => {
    expect(mcpToolAllowed({ all: ['a'], any: ['b', 'z'] }, held)).toBe(true);
    expect(mcpToolAllowed({ all: ['a'], any: ['y', 'z'] }, held)).toBe(false);
    expect(mcpToolAllowed({ all: ['z'], any: ['b'] }, held)).toBe(false);
  });
});
