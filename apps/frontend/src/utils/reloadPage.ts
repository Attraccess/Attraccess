/** Reloads the page. A module of its own, so tests can replace it: jsdom implements no navigation. */
export function reloadPage(): void {
  window.location.reload();
}
