import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ContinuationLabel } from './index';

it('marks a continuation without naming the id of the record it continues', () => {
  render(<ContinuationLabel previousUsageId={1234} />);

  expect(screen.getByText('Continues after a project change')).toBeInTheDocument();
  expect(screen.queryByText(/1234/)).not.toBeInTheDocument();
});

it.each([null, undefined])('marks nothing on a record that does not continue another (%j)', (previousUsageId) => {
  const { container } = render(<ContinuationLabel previousUsageId={previousUsageId} />);

  expect(container).toBeEmptyDOMElement();
});
