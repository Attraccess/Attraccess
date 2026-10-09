import '@testing-library/jest-dom/vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { waitFor } from '@testing-library/react';

export async function section(user: ReturnType<typeof userEvent.setup>, name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

export async function external(user: ReturnType<typeof userEvent.setup>, name: string) {
  await section(user, 'External devices');
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${name} `) }));
}
