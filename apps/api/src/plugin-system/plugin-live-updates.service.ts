import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { PluginLiveTopic, PluginLiveSubscription } from '@attraccess/plugins-backend-sdk';
import { liveSubscriptionKey } from '@attraccess/shared';
import { defer, Subject, takeUntil } from 'rxjs';
import { LiveTopicsService } from '../live-updates/live-topics.service';

/** Binds SDK registrations to one plugin; plugins cannot claim host or other plugin topics. */
@Injectable()
export class PluginLiveUpdatesService implements OnModuleDestroy {
  private readonly registrations = new Map<string, Set<() => void>>();

  constructor(private readonly registry: LiveTopicsService) {}

  register<T extends object>(pluginId: string, pluginName: string, definition: PluginLiveTopic<T>): () => void {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(definition.topic) ||
      typeof definition.authorize !== 'function' ||
      typeof definition.source !== 'function' ||
      !['none', 'required', 'optional'].includes(definition.identifier)
    ) {
      throw new Error('Invalid plugin live topic definition');
    }
    const topic = `plugin:${encodeURIComponent(pluginName)}:${definition.topic}` as const;
    const stop = new Subject<void>();
    const local = (subscription: { identifier?: string }): PluginLiveSubscription => ({
      topic: definition.topic,
      ...(subscription.identifier !== undefined ? { identifier: subscription.identifier } : {}),
    });
    let active = true;
    const unregister = this.registry.register({
      topics: [{ topic, scope: 'plugin', identifier: definition.identifier }],
      authorize: async (subscriptions, user) => {
        const rejected = new Map<string, string>();
        for (const subscription of subscriptions) {
          try {
            await definition.authorize(local(subscription as PluginLiveSubscription), user);
          } catch {
            rejected.set(liveSubscriptionKey(subscription), 'Plugin topic forbidden or unavailable');
          }
        }
        return rejected;
      },
      source: (subscription, user) =>
        defer(() => {
          if (!active) throw new Error('Plugin topic is no longer registered');
          return definition.source(local(subscription as PluginLiveSubscription), user);
        }).pipe(takeUntil(stop)),
    });
    const cleanup = () => {
      if (!active) return;
      active = false;
      stop.next();
      stop.complete();
      unregister();
      const registrations = this.registrations.get(pluginId);
      registrations?.delete(cleanup);
      if (!registrations?.size) this.registrations.delete(pluginId);
    };
    const registrations = this.registrations.get(pluginId) ?? new Set<() => void>();
    registrations.add(cleanup);
    this.registrations.set(pluginId, registrations);
    return cleanup;
  }

  clearPlugin(pluginId: string): void {
    this.registrations.get(pluginId)?.forEach((cleanup) => cleanup());
  }

  onModuleDestroy(): void {
    this.registrations.forEach((registrations) => registrations.forEach((cleanup) => cleanup()));
  }
}
