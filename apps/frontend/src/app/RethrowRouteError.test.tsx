import { Component, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { RethrowRouteError } from './RethrowRouteError';

class Outer extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p>outer caught {this.state.error.message}</p> : this.props.children;
  }
}

function Broken(): never {
  throw new Error('boom');
}

afterEach(cleanup);

it('passes a render error on instead of showing the default error page with its stack trace', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const router = createMemoryRouter([{ path: '*', element: <Broken />, errorElement: <RethrowRouteError /> }]);
  render(
    <Outer>
      <RouterProvider router={router} />
    </Outer>,
  );
  expect(screen.getByText('outer caught boom')).toBeTruthy();
  expect(screen.queryByText('Unexpected Application Error!')).toBeNull();
});
