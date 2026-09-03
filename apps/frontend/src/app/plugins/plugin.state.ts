import { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { LoadedPluginManifest } from '@attraccess/react-query-client';
import { create } from 'zustand';

export interface PluginManifestWithPlugin extends LoadedPluginManifest {
  plugin: AttraccessFrontendPlugin;
}

interface PluginState {
  plugins: PluginManifestWithPlugin[];
  addPlugin: (plugin: PluginManifestWithPlugin) => void;
  isInstalled: (pluginName: string) => boolean;
}

const usePluginState = create<PluginState>((set, get) => ({
  plugins: [],
  addPlugin: (plugin) =>
    set((state) => {
      return { plugins: [...state.plugins, plugin] };
    }),
  isInstalled: (pluginName) => get().plugins.some((plugin) => plugin.plugin.getPluginName() === pluginName),
}));

export default usePluginState;
