import { PluginSlotContext, PluginSlotContribution } from '@attraccess/plugins-frontend-sdk';
import { Component, ErrorInfo, PropsWithChildren, ReactNode, useMemo } from 'react';
import usePluginState from './plugin.state';

// Isolates a single plugin slot contribution so a throwing contribution cannot
// crash the host page it is embedded in. Unlike a full route, an embedded slot
// renders nothing on error (it is decoration inside a host screen, not the page
// itself) — the failure is logged for the plugin author.
interface PluginSlotBoundaryProps extends PropsWithChildren {
  pluginName?: string;
  slotId: string;
  // Stable identifier of the specific contribution (its `key`), so a crash maps
  // to one contribution even when a plugin mounts several into the same slot.
  contributionKey?: string;
}

class PluginSlotBoundary extends Component<PluginSlotBoundaryProps, { hasError: boolean }> {
  constructor(props: PluginSlotBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Attraccess Plugin System: slot "${this.props.slotId}" contribution "${
        this.props.contributionKey ?? 'unknown'
      }" from plugin "${this.props.pluginName ?? 'unknown'}" crashed`,
      error,
      info
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// Runs a contribution's render() inside the boundary's subtree so a throw during
// render is caught by the surrounding PluginSlotBoundary.
function SlotContribution({
  contribution,
  context,
}: {
  contribution: PluginSlotContribution;
  context: PluginSlotContext;
}) {
  return <>{contribution.render(context)}</>;
}

export interface PluginSlotProps<Context extends PluginSlotContext = PluginSlotContext> {
  // Host extension-point id. Plugins target this via getSlotContributions().
  slotId: string;
  // Context handed to each contribution (e.g. the selected entity id). The host
  // types this per slot (e.g. `{ mqttServerId: number }`); it stays a plain
  // object so the SDK keeps no domain knowledge.
  context?: Context;
}

// Generic extension point: renders every plugin contribution registered for
// `slotId`, each wrapped in an error boundary. Renders nothing (no wrapper DOM)
// when no plugin contributes, so the host UI is unchanged without plugins.
// `Context` lets the host type the context it passes per slot at the call site.
export function PluginSlot<Context extends PluginSlotContext = PluginSlotContext>({
  slotId,
  context,
}: PluginSlotProps<Context>) {
  const { plugins } = usePluginState();

  const contributions = useMemo(() => {
    return plugins.flatMap((manifest) => {
      let all: PluginSlotContribution[] | undefined;
      try {
        all = manifest.plugin.getSlotContributions?.();
      } catch (error) {
        console.error(
          `Attraccess Plugin System: getSlotContributions() of plugin "${manifest.plugin.getPluginName()}" threw`,
          error
        );
        return [];
      }
      return (all ?? [])
        .filter((contribution) => contribution.slotId === slotId)
        .map((contribution) => ({ contribution, pluginName: manifest.plugin.getPluginName() }));
    });
  }, [plugins, slotId]);

  if (contributions.length === 0) {
    return null;
  }

  const slotContext: Context = context ?? ({} as Context);

  return (
    <>
      {contributions.map(({ contribution, pluginName }, index) => (
        <PluginSlotBoundary
          key={contribution.key ?? `${pluginName}-${index}`}
          pluginName={pluginName}
          slotId={slotId}
          contributionKey={contribution.key}
        >
          <SlotContribution contribution={contribution} context={slotContext} />
        </PluginSlotBoundary>
      ))}
    </>
  );
}
