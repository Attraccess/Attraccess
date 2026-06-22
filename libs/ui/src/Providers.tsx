import { useTheme } from '@heroui/react';
import { PropsWithChildren, useEffect } from 'react';

interface ProvidersProps extends PropsWithChildren {
  defaultTheme?: 'dark' | 'light' | 'system';
}

export function Providers({ children, defaultTheme = 'system' }: ProvidersProps) {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (defaultTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(systemTheme);
    } else {
      setTheme(defaultTheme);
    }
  }, [defaultTheme, setTheme]);

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}
