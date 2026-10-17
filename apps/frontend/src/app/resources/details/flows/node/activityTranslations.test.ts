import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

describe.each([
  ['en', en],
  ['de', de],
])('activity node translations (%s)', (_locale, translations) => {
  it('keeps all activity actions in the shared catalog and canvas namespace', () => {
    const activity = translations.nodes.output.resource.activity;
    const titles = new Set<string>();
    for (const action of ['operating', 'idle', 'track-activity'] as const) {
      const node = activity[action];
      expect(node).toBeDefined();
      expect(node.title).not.toMatch(/nodes\.|output\.resource|!!!/);
      expect(node.description.length).toBeGreaterThan(20);
      expect(node.inputs.input).toBeTruthy();
      expect(node.outputs.output).toBeTruthy();
      titles.add(node.title);
    }
    expect(titles.size).toBe(3);
  });
});
