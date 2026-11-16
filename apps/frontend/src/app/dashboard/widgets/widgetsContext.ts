import { createContext, ReactNode, useContext } from 'react';

/** A widget the user may put on the dashboard right now, built in or contributed by a plugin. */
export interface DashboardWidget {
  id: string;
  title: string;
  /** One line for the "Add to dashboard" picker. */
  description: string;
  icon: ReactNode;
  /**
   * The body holds form fields. Fields must not sit on a Card surface, where they take its colour and disappear
   * (ATT-294 / ATT-834), so such a widget renders on the outlined section instead.
   */
  hasFields?: boolean;
  /** Extra content for the card header, such as a count. */
  renderHeaderExtra?: () => ReactNode;
  renderBody: () => ReactNode;
  /** Set for plugin widgets: the plugin's name for error logs and its manifest name for live updates. */
  plugin?: { pluginName: string; manifestName: string };
}

export interface DashboardWidgets {
  /** Widgets the user may use right now. */
  widgets: DashboardWidget[];
  /** Title of any widget the app knows, accessible or not, so an inaccessible pin can still be named. */
  titleOf: (id: string) => string | undefined;
  /** False until the license and the plugins have loaded, so a missing widget cannot yet be called inaccessible. */
  isReady: boolean;
}

// Provided by DashboardWidgetsProvider at the app root, for the same reason as PinnablePagesContext: the widgets
// check route access, which needs the route table, and the route table renders the dashboard.
export const DashboardWidgetsContext = createContext<DashboardWidgets>({
  widgets: [],
  titleOf: () => undefined,
  isReady: false,
});

export function useDashboardWidgets(): DashboardWidgets {
  return useContext(DashboardWidgetsContext);
}
