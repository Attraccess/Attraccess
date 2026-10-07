import { PropsWithChildren } from 'react';
import { PluginProvider as PluginProviderBase } from 'react-pluggable';
import { pluginStore } from './plugin-provider.plugin-store';
import { usePluginProviderState } from './usePluginProviderState';

export function PluginProvider(props: PropsWithChildren) {
  usePluginProviderState(props);

  return <PluginProviderBase pluginStore={pluginStore}>{props.children}</PluginProviderBase>;
}
