import { useRouteError } from 'react-router-dom';

/**
 * Route `errorElement` that passes a render error on instead of showing React Router's default error page,
 * which prints the stack trace to users. The app then fails as it did before the data router.
 */
export function RethrowRouteError(): never {
  throw useRouteError();
}
