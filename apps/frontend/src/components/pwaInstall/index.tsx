import { lazy, Suspense } from 'react';

const LazyPWAInstall = import.meta.env.DEV ? null : lazy(() => import('./PWAInstall.production'));

export function PWAInstall() {
  if (!LazyPWAInstall) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyPWAInstall />
    </Suspense>
  );
}
