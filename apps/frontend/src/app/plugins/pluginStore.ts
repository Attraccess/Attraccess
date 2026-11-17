import { createPluginStore } from 'react-pluggable';

/** Shared react-pluggable store that every loaded frontend plugin installs into. */
export const pluginStore = createPluginStore();
