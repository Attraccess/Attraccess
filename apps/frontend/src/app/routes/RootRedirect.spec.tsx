import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RootRedirect } from './RootRedirect';

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search + location.hash}</output>;
}

describe('RootRedirect', () => {
  it.each([
    ['/', '/resources'],
    ['/?enroll=K7P-3XQ', '/resources?enroll=K7P-3XQ'],
    ['/?enroll=K7P-3XQ#top', '/resources?enroll=K7P-3XQ#top'],
  ])('redirects %s to %s', async (from, to) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/resources" element={<CurrentUrl />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status', { name: 'Current URL' })).toHaveTextContent(to);
  });
});
