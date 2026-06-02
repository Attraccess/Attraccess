import { Component, ErrorInfo, PropsWithChildren, ReactNode } from 'react';

interface PluginRouteBoundaryProps extends PropsWithChildren {
  pluginName?: string;
}

interface PluginRouteBoundaryState {
  hasError: boolean;
}

// Isolates a plugin-contributed route so a throwing plugin page cannot crash the app shell.
export class PluginRouteBoundary extends Component<PluginRouteBoundaryProps, PluginRouteBoundaryState> {
  constructor(props: PluginRouteBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PluginRouteBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Attraccess Plugin System: route from plugin "${this.props.pluginName ?? 'unknown'}" crashed`,
      error,
      info
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8 text-center text-sm text-danger" role="alert">
          This plugin page failed to load.
        </div>
      );
    }

    return this.props.children;
  }
}
