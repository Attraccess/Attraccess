import { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { LoadedPluginManifest } from '@attraccess/react-query-client';
import { create } from 'zustand';

export interface PluginManifestWithPlugin extends LoadedPluginManifest {
  plugin: AttraccessFrontendPlugin;
}

interface PluginState {
  plugins: PluginManifestWithPlugin[];
  isLoading: boolean;
  addPlugin: (plugin: PluginManifestWithPlugin) => void;
  setLoading: (isLoading: boolean) => void;
  isInstalled: (pluginName: string) => boolean;
}

const usePluginState = create<PluginState>((set, get) => ({
  plugins: [],
  // Plugin routes are registered asynchronously. Keep routing in a pending
  // state until federation has finished so deep links do not hit the catch-all.
  isLoading: true,
  addPlugin: (plugin) =>
    set((state) => {
      return { plugins: [...state.plugins, plugin] };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  isInstalled: (pluginName) => get().plugins.some((plugin) => plugin.plugin.getPluginName() === pluginName),
}));

export default usePluginState;
