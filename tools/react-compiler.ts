import type { PluginItem } from '@babel/core';

export const reactCompilerBabelPlugins: PluginItem[] = ['babel-plugin-react-compiler'];

export const reactCompilerBabelConfig = {
  plugins: reactCompilerBabelPlugins,
};
