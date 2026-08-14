import { useLocation } from 'react-router-dom';

/**
 * The root the email pages are currently mounted under.
 *
 * The templates list, the template editor and the layout editor each render under two roots while
 * ATT-866 is outstanding: the standalone `/emails` pages, and the Email settings section at
 * `/settings/email`. All three navigate to siblings, so a hard-coded root drops the operator out of
 * whichever shell they arrived through — entering from the settings rail and opening a template
 * left Settings entirely, with the rail gone and nothing pointing back.
 *
 * Deriving it from the current path keeps both framings working, and leaves one line to delete when
 * the standalone routes go.
 */
export function useEmailBasePath(): '/settings/email' | '/emails' {
  const { pathname } = useLocation();
  return pathname.startsWith('/settings/email') ? '/settings/email' : '/emails';
}
