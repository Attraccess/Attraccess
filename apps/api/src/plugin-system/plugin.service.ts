import { PluginLifecycleImplementation } from './plugin-lifecycle';

export class PluginService extends PluginLifecycleImplementation {
  // Returns the discovered plugins enriched with their backend load status so the
  // admin UI can surface plugins that failed to load (e.g. a missing dependency)
  // instead of silently showing them as if everything were fine.
}
