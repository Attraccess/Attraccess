import { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import { LoadedPluginManifest } from '@attraccess/react-query-client';
import { create } from 'zustand';

export interface PluginManifestWithPlugin extends LoadedPluginManifest {
  plugin: AttraccessFrontendPlugin;
}

interface PluginState {
  plugins: PluginManifestWithPlugin[];
  /** True once the first plugin load finished, so a missing plugin page is known to be missing, not still loading. */
  isInitialized: boolean;
  setInitialized: (isInitialized: boolean) => void;
  addPlugin: (plugin: PluginManifestWithPlugin) => void;
  removePlugin: (pluginName: string) => void;
  isInstalled: (pluginName: string) => boolean;
}

const usePluginState = create<PluginState>((set, get) => ({
  plugins: [],
  isInitialized: false,
  setInitialized: (isInitialized) => set({ isInitialized }),
  addPlugin: (plugin) =>
    set((state) => ({
      plugins: [...state.plugins.filter((installed) => installed.name !== plugin.name), plugin],
    })),
  removePlugin: (pluginName) =>
    set((state) => ({ plugins: state.plugins.filter((plugin) => plugin.name !== pluginName) })),
  isInstalled: (pluginName) => get().plugins.some((plugin) => plugin.plugin.getPluginName() === pluginName),
}));

export default usePluginState;
