import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nTransComponent } from './index';

afterEach(cleanup);
it('renders nested mapped tags and passes interpolation values to the translator', () => {
  const t = vi.fn(() => 'Hello <strong>bold <link>link</link></strong>!<break/>');
  const { container } = render(
    <I18nTransComponent
      i18nKey="greeting"
      values={{ name: 'Maker' }}
      t={t}
      components={{ strong: <strong />, link: <a href="/docs">Placeholder</a>, break: <br /> }}
    />,
  );
  expect(t).toHaveBeenCalledWith('greeting', { name: 'Maker' });
  expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('href', '/docs');
  expect(container.querySelector('strong')).toHaveTextContent('bold link');
  expect(container.querySelector('br')).not.toBeNull();
  expect(container.textContent).toBe('Hello bold link!');
});
it.each([
  ['plain text', 'plain text'],
  ['<unknown>kept</unknown><empty/>', 'kept'],
  ['before </missing> after', 'before </missing> after'],
  ['<open>trailing', '<open>trailing'],
  ['<a>outer<b>inner</a>', 'outerinner'],
])('preserves readable text for %s', (template, expected) => {
  const { container } = render(<I18nTransComponent i18nKey="test" t={() => template} />);
  expect(container.textContent).toBe(expected);
});
