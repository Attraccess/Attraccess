import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlowLogKeepAlive } from './useFlowLogKeepAlive';

const state = vi.hoisted(() => ({
  keepAlive: vi.fn(),
  toast: { showToast: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('./flowOwner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flowOwner')>()),
  useKeepFlowLogRecordingAliveRequest: () => state.keepAlive,
}));
vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const START = new Date('2026-09-01T12:00:00Z');

function mount() {
  return renderHook(() => useFlowLogKeepAlive({ kind: 'resource', resourceId: 7 }));
}

function input(type = 'pointermove') {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Moves the wall clock without running timers, like a laptop waking from sleep, then shows the tab again. */
function wakeAfter(ms: number) {
  act(() => {
    vi.setSystemTime(Date.now() + ms);
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const toastsOfType = (type: string) =>
  state.toast.showToast.mock.calls.filter(([options]) => options.type === type).map(([options]) => options);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  state.keepAlive.mockReset();
  state.toast.showToast.mockReset();
  state.toast.dismiss.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('renewals', () => {
  it('renews as soon as the editor opens', () => {
    mount();
    expect(state.keepAlive).toHaveBeenCalledTimes(1);
  });

  it('renews about once a minute while someone uses the page', () => {
    mount();
    for (let elapsed = 0; elapsed < 5 * MINUTE; elapsed += 30 * SECOND) {
      advance(30 * SECOND);
      input();
    }
    // At 0, 1, 2, 3, 4 and 5 minutes.
    expect(state.keepAlive).toHaveBeenCalledTimes(6);
  });

  it('stops renewing after the final renewal at the 15 minute idle mark', () => {
    mount();
    advance(15 * MINUTE - SECOND);
    // At 0 to 14 minutes.
    expect(state.keepAlive).toHaveBeenCalledTimes(15);

    advance(SECOND);
    expect(state.keepAlive).toHaveBeenCalledTimes(16);

    advance(30 * MINUTE);
    expect(state.keepAlive).toHaveBeenCalledTimes(16);
  });

  it('sends nothing when the page wakes after more than 16 minutes without input', () => {
    mount();
    wakeAfter(17 * MINUTE);
    advance(20 * MINUTE);

    expect(state.keepAlive).toHaveBeenCalledTimes(1);
    expect(toastsOfType('warning')).toHaveLength(1);
  });

  it('never stops a recording and sends nothing on unmount', () => {
    const view = mount();
    view.unmount();
    advance(60 * MINUTE);
    expect(state.keepAlive).toHaveBeenCalledTimes(1);
  });
});

describe('idle toasts', () => {
  it('warns at 15 minutes and replaces the warning with the timed-out notice at 30 minutes', () => {
    const view = mount();
    advance(15 * MINUTE);

    expect(toastsOfType('warning')).toEqual([
      expect.objectContaining({
        title: 'logKeepAlive.warning.title',
        description: 'logKeepAlive.warning.description',
        duration: Infinity,
        action: expect.objectContaining({ label: 'logKeepAlive.warning.action' }),
      }),
    ]);
    expect(view.result.current.isPausedForInactivity).toBe(false);

    advance(15 * MINUTE);

    const [timedOut] = toastsOfType('info');
    expect(timedOut).toEqual(
      expect.objectContaining({
        title: 'logKeepAlive.timedOut.title',
        duration: Infinity,
        id: toastsOfType('warning')[0].id,
      }),
    );
    expect(view.result.current.isPausedForInactivity).toBe(true);
    // Shown once per idle period.
    advance(10 * MINUTE);
    expect(state.toast.showToast).toHaveBeenCalledTimes(2);
  });

  it('dismisses the warning and renews at once on input', () => {
    mount();
    advance(15 * MINUTE + 30 * SECOND);
    const renewals = state.keepAlive.mock.calls.length;

    input('keydown');

    expect(state.toast.dismiss).toHaveBeenCalledTimes(1);
    expect(state.keepAlive).toHaveBeenCalledTimes(renewals + 1);
  });

  it('treats "I\'m still here" as input', () => {
    mount();
    advance(15 * MINUTE);
    const renewals = state.keepAlive.mock.calls.length;

    act(() => toastsOfType('warning')[0].action.onClick());

    expect(state.toast.dismiss).toHaveBeenCalledTimes(1);
    expect(state.keepAlive).toHaveBeenCalledTimes(renewals + 1);
  });

  it('resumes after the timeout on input and warns again only after another idle period', () => {
    const view = mount();
    advance(31 * MINUTE);
    expect(view.result.current.isPausedForInactivity).toBe(true);
    const renewals = state.keepAlive.mock.calls.length;

    input('pointerdown');

    expect(view.result.current.isPausedForInactivity).toBe(false);
    expect(state.toast.dismiss).toHaveBeenCalledTimes(1);
    expect(state.keepAlive).toHaveBeenCalledTimes(renewals + 1);

    advance(14 * MINUTE);
    expect(toastsOfType('warning')).toHaveLength(1);
    expect(state.keepAlive.mock.calls.length).toBeGreaterThan(renewals + 10);
    advance(MINUTE);
    expect(toastsOfType('warning')).toHaveLength(2);
  });

  it('shows only the timed-out notice when the page wakes after 30 minutes', () => {
    const view = mount();
    wakeAfter(31 * MINUTE);

    expect(toastsOfType('warning')).toHaveLength(0);
    expect(toastsOfType('info')).toHaveLength(1);
    expect(view.result.current.isPausedForInactivity).toBe(true);
    expect(state.keepAlive).toHaveBeenCalledTimes(1);
  });

  it('closes its toast when the editor is left', () => {
    const view = mount();
    advance(15 * MINUTE);
    view.unmount();
    expect(state.toast.dismiss).toHaveBeenCalledWith(toastsOfType('warning')[0].id);
  });

  it('ignores input after unmount', () => {
    const view = mount();
    view.unmount();
    input();
    expect(state.keepAlive).toHaveBeenCalledTimes(1);
  });
});
