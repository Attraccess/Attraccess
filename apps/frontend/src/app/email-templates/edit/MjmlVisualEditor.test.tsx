import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MjmlVisualEditor } from './MjmlVisualEditor';
const state = vi.hoisted(() => ({
  init: vi.fn(),
  setComponents: vi.fn(),
  addType: vi.fn(),
  destroy: vi.fn(),
  html: '<mjml><mj-body><mj-section><mj-column><mj-image src="http://localhost:3000/api/logo.png" /></mj-column></mj-section></mj-body></mjml>',
  ready: undefined as (() => void) | undefined,
  update: undefined as (() => void) | undefined,
  locked: vi.fn(),
  unlocked: vi.fn(),
  template: { getMjmlTemplate: () => ({ start: '<mjml><mj-body>', end: '</mj-body></mjml>' }) },
  plugin: vi.fn(),
}));
vi.mock('../../../api', () => ({ getBaseUrl: () => 'http://localhost:3000' }));
vi.mock('grapesjs-mjml', () => ({ default: state.plugin }));
vi.mock('grapesjs', () => ({
  default: {
    init: (options: unknown) => {
      state.init(options);
      const parent = { getAttributes: () => ({ 'css-class': 'locked-chrome' }), parent: () => undefined };
      return {
        Components: {
          getTypes: () => [{ id: 'mj-text' }, { id: 'plain' }],
          getType: (id: string) =>
            id === 'mj-text'
              ? {
                  model: { prototype: { defaults: { 'style-default': { color: 'black' }, draggable: true } } },
                  view: { prototype: state.template },
                }
              : undefined,
          addType: state.addType,
        },
        setComponents: state.setComponents,
        getHtml: () => state.html,
        destroy: state.destroy,
        onReady: (callback: () => void) => {
          state.ready = callback;
        },
        on: (event: string, callback: () => void) => {
          if (event === 'update') state.update = callback;
        },
        getWrapper: () => ({
          onAll: (callback: (component: unknown) => void) => {
            callback({ getAttributes: () => ({}), parent: () => parent, set: state.locked });
            callback({ getAttributes: () => ({}), parent: () => undefined, set: state.unlocked });
          },
        }),
      };
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state.ready = undefined;
  state.update = undefined;
  state.template = { getMjmlTemplate: () => ({ start: '<mjml><mj-body>', end: '</mj-body></mjml>' }) };
  state.html =
    '<mjml><mj-body><mj-section><mj-column><mj-image src="http://localhost:3000/api/logo.png" /></mj-column></mj-section></mj-body></mjml>';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('initializes the editor without storage, preserves attributes and locks layout descendants', () => {
  render(
    <MjmlVisualEditor
      initialValue="<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>"
      language="en"
      headMjml="<mj-head><mj-title>Brand</mj-title></mj-head>"
      lockClass="locked-chrome"
      onChange={vi.fn()}
    />,
  );
  const options = state.init.mock.calls[0][0];
  expect(options).toMatchObject({ fromElement: false, storageManager: false, i18n: { locale: 'en' } });
  expect(options.parser.optionsHtml.preParser('A&nbsp;B')).toBe('A\u00a0B');
  options.plugins[0]('editor-instance');
  expect(state.plugin).toHaveBeenCalledWith('editor-instance', { useXmlParser: true });
  expect(state.addType).toHaveBeenCalledWith('mj-text', {
    model: { defaults: { 'style-default': {}, draggable: true } },
  });
  expect(state.template.getMjmlTemplate().start).toBe('<mjml><mj-head><mj-title>Brand</mj-title></mj-head><mj-body>');
  expect(state.locked).toHaveBeenCalledWith(
    expect.objectContaining({ locked: true, editable: false, removable: false }),
  );
  expect(state.unlocked).not.toHaveBeenCalled();
});
it('debounces user edits, restores logo placeholders and cancels pending saves on unmount', () => {
  const change = vi.fn();
  const latest = vi.fn();
  const view = render(<MjmlVisualEditor initialValue="<mj-section />" language="en" onChange={change} />);
  expect(state.update).toBeUndefined();
  act(() => state.ready?.());
  act(() => {
    state.update?.();
    vi.advanceTimersByTime(200);
    state.update?.();
    vi.advanceTimersByTime(299);
  });
  expect(change).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0][0]).toContain('{{host.logoUrl}}');
  expect(change.mock.calls[0][0]).not.toContain('<mjml>');
  view.rerender(<MjmlVisualEditor initialValue="<mj-section />" language="en" onChange={latest} exportFullDocument />);
  act(() => {
    state.update?.();
    vi.advanceTimersByTime(300);
  });
  expect(latest.mock.calls[0][0]).toContain('<mjml>');
  expect(state.init).toHaveBeenCalledOnce();
  act(() => state.update?.());
  view.unmount();
  act(() => vi.advanceTimersByTime(300));
  expect(latest).toHaveBeenCalledOnce();
  expect(state.destroy).toHaveBeenCalledOnce();
});
it('strips scripts from preview and warns when a full-document head will be dropped', () => {
  render(
    <MjmlVisualEditor
      initialValue="<mjml><mj-head><mj-title>Brand</mj-title></mj-head><mj-body><mj-raw><script>alert(1)</script></mj-raw></mj-body></mjml>"
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(state.setComponents.mock.calls[0][0]).not.toContain('<script>');
  expect(screen.getByText(/script.*tags that have been removed/)).toBeInTheDocument();
  expect(screen.getByText(/document-level styles/)).toBeInTheDocument();
});
it('warns about malformed XML and uses the fallback parser', () => {
  render(<MjmlVisualEditor initialValue="<mj-section><mj-column><mj-text>Unclosed" language="en" onChange={vi.fn()} />);
  expect(screen.getByText(/not well-formed XML/)).toBeInTheDocument();
  state.init.mock.calls[0][0].plugins[0]('editor');
  expect(state.plugin).toHaveBeenCalledWith('editor', { useXmlParser: false });
});
