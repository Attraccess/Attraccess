import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';

afterEach(cleanup);

function setup(onRefresh = vi.fn(() => Promise.resolve())) {
  const view = render(
    <PullToRefresh
      onRefresh={onRefresh}
      threshold={90}
      pullingContent={<p>Pull hint</p>}
      refreshingContent={<p>Spinner</p>}
    >
      <main data-cy="scroller" style={{ overflowY: 'auto' }}>
        <div style={{ overflowY: 'hidden' }} data-cy="clipper">
          <p>Nested text</p>
        </div>
        <p>Plain text</p>
        <input aria-label="Username" />
        <input aria-label="Password" type="password" />
        <textarea aria-label="Notes" />
        <select aria-label="Role">
          <option>Admin</option>
        </select>
        <div contentEditable aria-label="Editor" suppressContentEditableWarning>
          <span>Rich text</span>
        </div>
      </main>
    </PullToRefresh>,
  );
  const content = view.container.querySelector<HTMLElement>('[data-cy="pull-to-refresh-content"]');
  if (!content) throw new Error('content wrapper missing');
  return { onRefresh, content };
}

const at = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

/** Touches down on `target` at (100, 100) and moves through `moves`; returns whether any move was cancelled. */
function drag(target: Element, moves: [number, number][]) {
  fireEvent.touchStart(target, at(100, 100));
  return moves.map(([x, y]) => !fireEvent.touchMove(target, at(x, y))).some(Boolean);
}

describe('PullToRefresh', () => {
  it.each([
    ['a text input', () => screen.getByLabelText('Username')],
    ['a password input', () => screen.getByLabelText('Password')],
    ['a textarea', () => screen.getByLabelText('Notes')],
    ['a select', () => screen.getByLabelText('Role')],
    ['a contenteditable child', () => screen.getByText('Rich text')],
  ])('leaves a touch on %s native, even when it moves down', (_, target) => {
    const { content } = setup();
    const prevented = drag(target(), [
      [100, 101],
      [100, 150],
      [100, 300],
    ]);
    fireEvent.touchEnd(target());

    expect(prevented).toBe(false);
    expect(content.style.transform).toBe('');
    expect(screen.queryByText('Pull hint')).toBeNull();
  });

  it('never cancels a stationary or jittery long-press on plain content', () => {
    const { content, onRefresh } = setup();
    const prevented = drag(screen.getByText('Plain text'), [
      [102, 103],
      [97, 106],
      [104, 95],
      [100, 107],
      [100, 100],
    ]);
    fireEvent.touchEnd(screen.getByText('Plain text'));

    expect(prevented).toBe(false);
    expect(content.style.transform).toBe('');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes after a downward pull past the threshold and shows the spinner until it settles', async () => {
    let finish: () => void = () => undefined;
    const { content, onRefresh } = setup(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))));
    const target = screen.getByText('Plain text');

    fireEvent.touchStart(target, at(100, 100));
    expect(fireEvent.touchMove(target, at(100, 115))).toBe(false);
    expect(screen.getByText('Pull hint')).toBeInTheDocument();
    expect(content.style.transform).toBe('translateY(7px)');

    fireEvent.touchMove(target, at(102, 210));
    expect(screen.getByText('Spinner')).toBeInTheDocument();
    fireEvent.touchEnd(target);

    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(screen.getByText('Spinner')).toBeInTheDocument();
    expect(content.style.transform).toBe('translateY(90px)');

    await act(async () => finish());
    expect(screen.queryByText('Spinner')).toBeNull();
    expect(content.style.transform).toBe('');
  });

  it('snaps back without refreshing when released below the threshold', () => {
    const { content, onRefresh } = setup();
    const target = screen.getByText('Plain text');

    expect(drag(target, [[100, 150]])).toBe(true);
    fireEvent.touchEnd(target);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
    expect(screen.queryByText('Pull hint')).toBeNull();
  });

  it('cancels instead of refreshing when the touch is cancelled past the threshold', () => {
    const { onRefresh } = setup();
    const target = screen.getByText('Plain text');

    drag(target, [[100, 250]]);
    fireEvent.touchCancel(target);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('counts the finger travel against the threshold, as the old library did', async () => {
    const { onRefresh } = setup();
    const target = screen.getByText('Plain text');

    drag(target, [[100, 190]]);
    expect(screen.getByText('Spinner')).toBeInTheDocument();
    fireEvent.touchEnd(target);

    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it('does not start a second refresh while one is running, and resets when it fails', async () => {
    let fail: (reason: Error) => void = () => undefined;
    const { content, onRefresh } = setup(vi.fn(() => new Promise<void>((_, reject) => (fail = reject))));
    const target = screen.getByText('Plain text');

    drag(target, [[100, 250]]);
    fireEvent.touchEnd(target);
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(drag(target, [[100, 250]])).toBe(false);
    fireEvent.touchEnd(target);
    expect(onRefresh).toHaveBeenCalledOnce();

    await act(async () => fail(new Error('offline')));
    expect(screen.queryByText('Spinner')).toBeNull();
    expect(content.style.transform).toBe('');
  });

  it('does not start when a scrollable ancestor is scrolled down, even several levels up', () => {
    const { content } = setup();
    Object.defineProperty(screen.getByRole('main'), 'scrollTop', { value: 40, configurable: true });

    expect(drag(screen.getByText('Nested text'), [[100, 250]])).toBe(false);
    expect(content.style.transform).toBe('');
  });

  it('ignores a scroll offset left on an ancestor that clips instead of scrolling', () => {
    setup();
    const clipper = screen.getByText('Nested text').parentElement as HTMLElement;
    Object.defineProperty(clipper, 'scrollTop', { value: 40, configurable: true });

    expect(drag(screen.getByText('Nested text'), [[100, 250]])).toBe(true);
  });

  it.each([
    ['upward', [100, 60]],
    ['mainly horizontal', [160, 120]],
  ] as const)('does not start for an %s gesture, even if it turns downward later', (_, first) => {
    const { content } = setup();
    expect(drag(screen.getByText('Plain text'), [[...first], [100, 300]])).toBe(false);
    expect(content.style.transform).toBe('');
  });

  it('hands the gesture back when the finger returns above its start point', () => {
    const { content } = setup();
    const target = screen.getByText('Plain text');

    expect(drag(target, [[100, 150]])).toBe(true);
    expect(fireEvent.touchMove(target, at(100, 90))).toBe(true);
    expect(content.style.transform).toBe('');
    expect(fireEvent.touchMove(target, at(100, 40))).toBe(true);
  });

  it('ignores multi-touch gestures such as pinch-zoom', () => {
    setup();
    const target = screen.getByText('Plain text');
    fireEvent.touchStart(target, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ],
    });
    expect(fireEvent.touchMove(target, at(100, 250))).toBe(true);
  });

  it('snaps back when a second finger joins a pull', () => {
    const { content, onRefresh } = setup();
    const target = screen.getByText('Plain text');

    drag(target, [[100, 150]]);
    expect(content.style.transform).not.toBe('');
    fireEvent.touchStart(target, {
      touches: [
        { clientX: 100, clientY: 150 },
        { clientX: 200, clientY: 150 },
      ],
    });
    fireEvent.touchEnd(target);

    expect(content.style.transform).toBe('');
    expect(screen.queryByText('Pull hint')).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const { content } = setup();
    const remove = vi.spyOn(content, 'removeEventListener');
    cleanup();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
  });
});
