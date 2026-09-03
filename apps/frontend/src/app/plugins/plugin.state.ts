import { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { LoadedPluginManifest } from '@attraccess/react-query-client';
import { create } from 'zustand';

export interface PluginManifestWithPlugin extends LoadedPluginManifest {
  plugin: AttraccessFrontendPlugin;
}

interface PluginState {
  plugins: PluginManifestWithPlugin[];
  pluginsLoaded: boolean;
  addPlugin: (plugin: PluginManifestWithPlugin) => void;
  setPluginsLoaded: () => void;
  isInstalled: (pluginName: string) => boolean;
}

const usePluginState = create<PluginState>((set, get) => ({
  plugins: [],
  pluginsLoaded: false,
  addPlugin: (plugin) =>
    set((state) => {
      return { plugins: [...state.plugins, plugin] };
    }),
  setPluginsLoaded: () => set({ pluginsLoaded: true }),
  isInstalled: (pluginName) => get().plugins.some((plugin) => plugin.plugin.getPluginName() === pluginName),
}));

export default usePluginState;
