import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';

type Theme = 'dark' | 'light' | 'system';
const storageKey = 'heroui-theme';

function parseTheme(value: string | null, fallback: Theme): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
}

function readTheme(fallback: Theme): Theme {
  try {
    return parseTheme(localStorage.getItem(storageKey), fallback);
  } catch {
    return fallback;
  }
}

const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
} | null>(null);

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const isSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ProvidersProps extends PropsWithChildren {
  defaultTheme?: Theme;
}

export function Providers({ children, defaultTheme = 'light' }: ProvidersProps) {
  const [theme, setThemeState] = useState(() => readTheme(defaultTheme));
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, isSystemDark, () => false);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setThemeState(parseTheme(event.newValue, defaultTheme));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [defaultTheme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Keep the selected appearance usable even when browser storage is blocked.
    }
  };

  return <ThemeContext value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used within Providers');
  return value;
}
