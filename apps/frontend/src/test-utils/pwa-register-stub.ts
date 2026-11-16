// Stand-in for the `virtual:pwa-register` module that vite-plugin-pwa provides at build time.
export function registerSW(): () => Promise<void> {
  return async () => undefined;
}
