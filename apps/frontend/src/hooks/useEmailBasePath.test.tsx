import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useEmailBasePath } from './useEmailBasePath';

const at = (path: string) =>
  renderHook(() => useEmailBasePath(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  }).result.current;

// The templates list, the template editor and the layout editor are each mounted under two roots
// while the standalone /emails routes still exist. Hard-coding either one made the settings framing
// a one-way door: opening a template from the rail left Settings with nothing pointing back.
describe('useEmailBasePath', () => {
  it('keeps navigation inside the settings shell when mounted there', () => {
    expect(at('/settings/email')).toBe('/settings/email');
    expect(at('/settings/email/templates')).toBe('/settings/email');
    expect(at('/settings/email/templates/verify-email')).toBe('/settings/email');
    expect(at('/settings/email/layout')).toBe('/settings/email');
  });

  it('keeps the standalone pages on their own root', () => {
    expect(at('/emails')).toBe('/emails');
    expect(at('/emails/templates')).toBe('/emails');
    expect(at('/emails/templates/verify-email')).toBe('/emails');
    expect(at('/emails/layout')).toBe('/emails');
  });
});
