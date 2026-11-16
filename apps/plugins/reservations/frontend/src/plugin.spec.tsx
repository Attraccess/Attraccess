import { afterEach, describe, expect, it, vi } from 'vitest';
import ReservationsPlugin from './plugin';
import { mockFetch } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

const auth = (effectivePermissions: string[] = [], id = 1) =>
  ({ authToken: 'token', user: { id, effectivePermissions } }) as never;

const manageLinks = (plugin: ReservationsPlugin) =>
  plugin.getSidebarItems().filter((item) => item.path === '/reservations/manage');

describe('ReservationsPlugin manager probe', () => {
  it('asks GET /manage/access once for concurrent auth notifications and shows the manage link', async () => {
    const calls = mockFetch({ 'GET /manage/access': { isManager: true } });
    const plugin = new ReservationsPlugin();
    const changed = vi.fn();
    plugin.onSidebarItemsChange(changed);
    plugin.onApiAuthStateChange(auth());
    plugin.onApiAuthStateChange(auth());
    plugin.onApiAuthStateChange(auth());
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(calls.filter((call) => call.path === '/manage/access')).toHaveLength(1);
    expect(calls.some((call) => call.path === '/manage')).toBe(false);
    expect(manageLinks(plugin)).toHaveLength(1);
  });

  it('skips the probe for resources.update and hides the link after logout', async () => {
    const calls = mockFetch({});
    const plugin = new ReservationsPlugin();
    plugin.onApiAuthStateChange(auth(['resources.update']));
    expect(manageLinks(plugin)).toHaveLength(1);
    plugin.onApiAuthStateChange(null);
    expect(manageLinks(plugin)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('ignores an answer that arrives after the user logged out', async () => {
    let answer: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    const plugin = new ReservationsPlugin();
    plugin.onApiAuthStateChange(auth());
    plugin.onApiAuthStateChange(null);
    answer({ ok: true, status: 200, text: async () => JSON.stringify({ isManager: true }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manageLinks(plugin)).toHaveLength(0);
  });

  it('does not hand a probe still running for the previous user to the next user', async () => {
    const answers: ((value: unknown) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => answers.push(resolve))),
    );
    const reply = (isManager: boolean) => ({ ok: true, status: 200, text: async () => JSON.stringify({ isManager }) });
    const plugin = new ReservationsPlugin();
    plugin.onApiAuthStateChange(auth([], 1));
    plugin.onApiAuthStateChange(auth([], 2));
    expect(answers).toHaveLength(2);
    answers[0](reply(true));
    answers[1](reply(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manageLinks(plugin)).toHaveLength(0);
  });
});
