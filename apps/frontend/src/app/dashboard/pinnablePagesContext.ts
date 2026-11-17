import { createContext, ReactNode, useContext } from 'react';

export interface PinnablePage {
  path: string;
  title: string;
  icon: ReactNode;
  badgeCount?: number;
  /** The "Add widget" gallery group it is listed in: a built-in group id, or `plugin:<manifest name>`. */
  galleryGroup: string;
}

export interface PinnablePages {
  /** Pages the user may pin and open right now. */
  pages: PinnablePage[];
  /** Title of any page the sidebar knows, accessible or not, so an inaccessible pin can still be named. */
  titleOf: (path: string) => string | undefined;
  /** False until the license and the plugins have loaded, so a missing page cannot yet be called inaccessible. */
  isReady: boolean;
}

// Provided by PinnablePagesProvider at the app root. It is a context rather than a hook import because the
// registry needs the route table, and the route table renders the dashboard.
export const PinnablePagesContext = createContext<PinnablePages>({
  pages: [],
  titleOf: () => undefined,
  isReady: false,
});

export function usePinnablePages(): PinnablePages {
  return useContext(PinnablePagesContext);
}
