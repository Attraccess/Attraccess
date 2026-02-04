import { describe, expect, it } from 'vitest';
import { reactCompilerBabelConfig, reactCompilerBabelPlugins } from '@attraccess/react-compiler';

describe('react compiler babel config', () => {
  it('includes the react compiler plugin', () => {
    expect(reactCompilerBabelPlugins).toContain('babel-plugin-react-compiler');
  });

  it('reuses the compiler plugin list in config', () => {
    expect(reactCompilerBabelConfig.plugins).toBe(reactCompilerBabelPlugins);
  });
});
