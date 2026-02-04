import type { PluginItem, TransformOptions } from '@babel/core';

export const reactCompilerBabelPlugins: PluginItem[] = ['babel-plugin-react-compiler'];

export const reactCompilerBabelConfig: TransformOptions = {
  plugins: reactCompilerBabelPlugins,
};
