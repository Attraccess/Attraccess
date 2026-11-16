import { createContext, ReactNode, useContext } from 'react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import type { TileSizes } from '../sizes';

/** A widget's header extra may hold links, which must not work while the dashboard is edited. */
export type HeaderExtraProps = DashboardWidgetRenderProps & { isEditing: boolean };

/** A heading of the "Add widget" gallery. Built-in ids are fixed; plugin groups are `plugin:<manifest name>`. */
export interface GalleryGroup {
  id: string;
  title: string;
}

/** A widget the user may put on the dashboard right now, built in or contributed by a plugin. */
export interface DashboardWidget extends TileSizes {
  id: string;
  title: string;
  /** One line for the "Add widget" gallery. */
  description: string;
  icon: ReactNode;
  group: GalleryGroup;
  /** Extra search terms for the gallery. */
  keywords?: string[];
  /** The page the header links to outside edit mode. */
  href?: string;
  /**
   * The body holds form fields. Fields must not sit on a Card surface, where they take its colour and disappear
   * (ATT-294 / ATT-834), so such a widget renders on the outlined section instead.
   */
  hasFields?: boolean;
  /** Extra content for the card header, such as a count. */
  renderHeaderExtra?: (props: HeaderExtraProps) => ReactNode;
  renderBody: (props: DashboardWidgetRenderProps) => ReactNode;
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
