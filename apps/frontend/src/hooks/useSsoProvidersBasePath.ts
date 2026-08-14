import { useLocation } from 'react-router-dom';

interface SsoProviderPaths {
  /** Where the provider list lives — the target for "back", post-save and post-delete. */
  list: string;
  /** The root the per-provider form is mounted under; `/new` and `/:id` hang off it. */
  form: string;
}

/**
 * Where the SSO provider pages live, given the root they are currently mounted under.
 *
 * Same problem as {@link useEmailBasePath}: the provider list, its per-provider form and the form's
 * post-save and post-delete redirects all render under two roots while ATT-866 is outstanding — the
 * standalone `/sso/providers` pages, and the Single sign-on settings section at `/settings/sso`.
 * Every one of them navigated to the hard-coded standalone root, so an operator entering from the
 * settings rail was one click from being dropped out of Settings, with the rail gone and the form's
 * back button pointing at a page they never came from.
 *
 * Two paths rather than one, because the two framings disagree about where the *list* is. Standalone
 * puts it at `/sso/providers`, with the form a child of it. In Settings the list is the section
 * itself at `/settings/sso`, and only the form sits under `/providers` — so a single base would send
 * "back" to `/settings/sso/providers`, which is nobody's route.
 *
 * Leaves one file to delete when the standalone routes go.
 */
export function useSsoProvidersBasePath(): SsoProviderPaths {
  const { pathname } = useLocation();
  return pathname.startsWith('/settings/sso')
    ? { list: '/settings/sso', form: '/settings/sso/providers' }
    : { list: '/sso/providers', form: '/sso/providers' };
}
