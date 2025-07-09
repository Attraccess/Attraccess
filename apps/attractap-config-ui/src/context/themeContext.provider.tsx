import { useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './ThemeContext';

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [isDark, setIsDark] = useState<boolean>(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);

    // Add event listener
    mediaQuery.addEventListener('change', handleChange);

    // Apply theme on initial load
    document.documentElement.classList.toggle('dark', isDark);

    // Clean up
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const themeContextValue = useMemo(() => ({ isDark, setIsDark }), [isDark]);

  return <ThemeContext.Provider value={themeContextValue}>{children}</ThemeContext.Provider>;
}
