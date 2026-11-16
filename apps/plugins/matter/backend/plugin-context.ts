// The host hands each plugin its PluginContext under this token. Recreated here (the value is not imported) so the
// artifact has no runtime dependency on the SDK: Symbol.for() resolves against the process-global registry, so this
// is the exact symbol the host registers.
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
