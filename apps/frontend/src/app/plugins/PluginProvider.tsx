import { PropsWithChildren } from 'react';
import { PluginProvider as PluginProviderBase } from 'react-pluggable';
import { pluginStore } from './pluginStore';
import { usePluginAuthSync } from './usePluginAuthSync';
import { usePluginLoading } from './usePluginLoading';
import { usePluginRuntimeBootstrap } from './usePluginRuntimeBootstrap';

export function PluginProvider({ children }: PropsWithChildren) {
  usePluginRuntimeBootstrap();
  usePluginAuthSync();
  usePluginLoading();

  return <PluginProviderBase pluginStore={pluginStore}>{children}</PluginProviderBase>;
}
