import { Navigate, useLocation } from 'react-router-dom';

/**
 * Sends `/` to the resource overview and keeps the query and hash, so app-wide links such as
 * `/?enroll=CODE` still reach the dialogs that read them.
 */
export function RootRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/resources', search, hash }} replace />;
}
