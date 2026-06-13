import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttraccessUser } from './AttraccessUser';

describe('AttraccessUser', () => {
  it('renders a mini avatar without the username text', () => {
    render(<AttraccessUser user={{ id: 42, username: 'supervisor' }} variant="mini" />);

    expect(screen.getByLabelText('supervisor')).toBeInTheDocument();
    expect(screen.queryByText('supervisor')).not.toBeInTheDocument();
  });
});
