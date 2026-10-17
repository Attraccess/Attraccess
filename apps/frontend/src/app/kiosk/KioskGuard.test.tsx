import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { KioskGuard } from './KioskGuard';

function Page() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <KioskGuard />
      <span>{location.pathname + location.search}</span>
      <button onClick={() => navigate('/kiosk/resources/7?mode=touch')}>Enter kiosk</button>
      <button onClick={() => navigate('/kiosk/resources/8?mode=touch')}>Switch kiosk</button>
      <button onClick={() => navigate('/resources')}>Leave kiosk</button>
    </>
  );
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/resources']}>
      <Page />
    </MemoryRouter>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps public routes usable when session storage is unavailable', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage is blocked', 'SecurityError');
  });
  open();
  expect(screen.getByText('/resources')).toBeTruthy();
});

it('retains the kiosk destination in memory when storage reads and writes fail', () => {
  vi.stubGlobal('sessionStorage', {
    getItem: () => {
      throw new DOMException('Storage read is blocked', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('Storage write is blocked', 'QuotaExceededError');
    },
  });
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Enter kiosk' }));
  expect(screen.getByText('/kiosk/resources/7?mode=touch')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Leave kiosk' }));
  expect(screen.getByText('/kiosk/resources/7?mode=touch')).toBeTruthy();
});

it('restores the persisted kiosk destination on remount', () => {
  const view = open();
  fireEvent.click(screen.getByRole('button', { name: 'Enter kiosk' }));
  expect(sessionStorage.getItem('kiosk-return')).toBe('/kiosk/resources/7?mode=touch');
  view.unmount();
  open();
  expect(screen.getByText('/kiosk/resources/7?mode=touch')).toBeTruthy();
});

it('prefers the latest kiosk destination when its storage write fails', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Enter kiosk' }));
  expect(sessionStorage.getItem('kiosk-return')).toBe('/kiosk/resources/7?mode=touch');
  vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage write is blocked', 'QuotaExceededError');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Switch kiosk' }));
  expect(screen.getByText('/kiosk/resources/8?mode=touch')).toBeTruthy();
  expect(sessionStorage.getItem('kiosk-return')).toBe('/kiosk/resources/7?mode=touch');
  fireEvent.click(screen.getByRole('button', { name: 'Leave kiosk' }));
  expect(screen.getByText('/kiosk/resources/8?mode=touch')).toBeTruthy();
});
