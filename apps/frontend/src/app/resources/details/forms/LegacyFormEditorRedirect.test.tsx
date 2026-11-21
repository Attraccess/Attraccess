import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { LegacyFormEditorRedirect } from './LegacyFormEditorRedirect';

afterEach(cleanup);

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/resources/:id/forms/:formId" element={<LegacyFormEditorRedirect />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );

it('sends an old editor link to the form at /forms/:formId', () => {
  mount('/resources/7/forms/11');
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/forms\/11$/);
});

it('keeps an old "new form" link creating a form for its resource', () => {
  mount('/resources/7/forms/new');
  expect(screen.getByTestId('location')).toHaveTextContent('/forms/new?scope=resource&resourceId=7');
});
