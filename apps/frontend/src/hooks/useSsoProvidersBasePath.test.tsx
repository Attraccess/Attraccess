import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useSsoProvidersBasePath } from './useSsoProvidersBasePath';

const at = (path: string) =>
  renderHook(() => useSsoProvidersBasePath(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  }).result.current;

// The provider list, the per-provider form and the form's post-save and post-delete redirects are
// each mounted under two roots while the standalone /sso routes still exist. Hard-coding the
// standalone one made the settings framing a one-way door: "Add new" from the rail left Settings,
// and the form's back button pointed at a page the operator never came from.
describe('useSsoProvidersBasePath', () => {
  it('keeps navigation inside the settings shell when mounted there', () => {
    expect(at('/settings/sso')).toEqual({ list: '/settings/sso', form: '/settings/sso/providers' });
    expect(at('/settings/sso/providers/new')).toEqual({ list: '/settings/sso', form: '/settings/sso/providers' });
    expect(at('/settings/sso/providers/42')).toEqual({ list: '/settings/sso', form: '/settings/sso/providers' });
  });

  it('keeps the standalone pages on their own root', () => {
    expect(at('/sso/providers')).toEqual({ list: '/sso/providers', form: '/sso/providers' });
    expect(at('/sso/providers/new')).toEqual({ list: '/sso/providers', form: '/sso/providers' });
    expect(at('/sso/providers/42')).toEqual({ list: '/sso/providers', form: '/sso/providers' });
  });

  it('sends the settings framing back to the section, not under /providers', () => {
    // The two framings disagree about where the list is: standalone nests the form under it, while
    // in Settings the list *is* the section. A single base path sent "back" to
    // `/settings/sso/providers`, which is nobody's route — a blank page with no rail.
    expect(at('/settings/sso/providers/new').list).toBe('/settings/sso');
    expect(at('/settings/sso/providers/new').list).not.toBe('/settings/sso/providers');
  });
});
