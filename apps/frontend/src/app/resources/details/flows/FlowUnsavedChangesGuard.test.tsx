import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { FlowUnsavedChangesGuard } from './FlowUnsavedChangesGuard';

const EDITOR = '/devices/flows/3';

function Editor({ initiallyDirty }: Readonly<{ initiallyDirty: boolean }>) {
  const [dirty, setDirty] = useState(initiallyDirty);
  return (
    <>
      <FlowUnsavedChangesGuard isDirty={dirty} />
      <button onClick={() => setDirty(!dirty)}>Toggle dirty</button>
      <Link to="/devices">Back</Link>
      <p>Editor</p>
    </>
  );
}

function show(initiallyDirty: boolean) {
  const router = createMemoryRouter(
    [
      { path: '/devices/flows/:flowId', element: <Editor initiallyDirty={initiallyDirty} /> },
      { path: '/devices', element: <p>Devices</p> },
    ],
    { initialEntries: ['/devices', EDITOR] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const dialog = () => screen.queryByRole('alertdialog');

afterEach(cleanup);

describe('FlowUnsavedChangesGuard', () => {
  it('lets a clean editor leave without asking', async () => {
    const router = show(false);
    fireEvent.click(screen.getByText('Back'));
    expect(await screen.findByText('Devices')).toBeTruthy();
    expect(dialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/devices');
  });

  it('asks before leaving a dirty editor; Stay keeps the editor and its URL', async () => {
    const router = show(true);
    fireEvent.click(screen.getByText('Back'));
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    expect(router.state.location.pathname).toBe(EDITOR);

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(router.state.location.pathname).toBe(EDITOR);
    expect(screen.getByText('Editor')).toBeTruthy();

    // The guard stays armed after Stay.
    fireEvent.click(screen.getByText('Back'));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('treats Escape as Stay', async () => {
    const router = show(true);
    fireEvent.click(screen.getByText('Back'));
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
    expect(router.state.location.pathname).toBe(EDITOR);
  });

  it('continues to the target on Leave without saving', async () => {
    const router = show(true);
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('Devices')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/devices');
  });

  it('asks on browser Back and keeps the editor URL on Stay', async () => {
    const router = show(true);
    await act(() => router.navigate(-1));
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(router.state.location.pathname).toBe(EDITOR);
  });

  it('never asks for search or hash changes on the editor page', async () => {
    const router = show(true);
    await act(() => router.navigate(`${EDITOR}?node=a#b`));
    expect(router.state.location.search).toBe('?node=a');
    expect(router.state.location.hash).toBe('#b');
    await act(() => router.navigate(`${EDITOR}?node=c`));
    expect(router.state.location.search).toBe('?node=c');
    expect(dialog()).toBeNull();
  });

  it('makes the browser ask before unloading only while dirty, and stops when clean or unmounted', () => {
    const unloadIsPrevented = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    show(false);
    expect(unloadIsPrevented()).toBe(false);

    fireEvent.click(screen.getByText('Toggle dirty'));
    expect(unloadIsPrevented()).toBe(true);

    fireEvent.click(screen.getByText('Toggle dirty'));
    expect(unloadIsPrevented()).toBe(false);

    fireEvent.click(screen.getByText('Toggle dirty'));
    expect(unloadIsPrevented()).toBe(true);
    cleanup();
    expect(unloadIsPrevented()).toBe(false);
  });
});
