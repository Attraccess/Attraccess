import {
  ComponentType,
  createContext,
  PropsWithChildren,
  RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

interface PageHeaderAccessoryContextValue {
  accessory: ComponentType;
  register: (header: HTMLElement) => () => void;
  owner: HTMLElement | null;
}

const PageHeaderAccessoryContext = createContext<PageHeaderAccessoryContextValue | null>(null);

const firstInDocument = (headers: HTMLElement[]) =>
  headers.reduce<HTMLElement | null>(
    (first, header) =>
      !first || first.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_PRECEDING ? header : first,
    null,
  );

export interface PageHeaderAccessoryProviderProps {
  /** Rendered beside the actions of the page's main header. It decides itself whether to show anything. */
  accessory: ComponentType;
}

/**
 * Host only: plugins must not render this provider, or they replace the host's control on their pages.
 *
 * Lets the host add a page-level control, such as the dashboard pin, to every PageHeader below it, including those
 * of plugin pages. Only the first header in document order shows it, so section headers on the same page never
 * repeat it. Without a provider, PageHeader renders exactly as before.
 */
export function PageHeaderAccessoryProvider({
  accessory,
  children,
}: PropsWithChildren<PageHeaderAccessoryProviderProps>) {
  const [headers, setHeaders] = useState<HTMLElement[]>([]);
  const register = useCallback((header: HTMLElement) => {
    setHeaders((current) => [...current, header]);
    return () => setHeaders((current) => current.filter((registered) => registered !== header));
  }, []);
  const owner = useMemo(() => firstInDocument(headers), [headers]);
  const value = useMemo(() => ({ accessory, register, owner }), [accessory, register, owner]);

  return <PageHeaderAccessoryContext.Provider value={value}>{children}</PageHeaderAccessoryContext.Provider>;
}

/** The host accessory for this header, or null when there is none or another header on the page shows it. */
export function usePageHeaderAccessory(header: RefObject<HTMLElement | null>): ComponentType | null {
  const context = useContext(PageHeaderAccessoryContext);
  const register = context?.register;

  useLayoutEffect(() => {
    if (!register || !header.current) return undefined;
    return register(header.current);
  }, [register, header]);

  return context && context.owner !== null && context.owner === header.current ? context.accessory : null;
}
