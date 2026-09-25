// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPinToggle } from './pins';

const { getPins, updatePins } = vi.hoisted(() => ({ getPins: vi.fn(), updatePins: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  DashboardService: { dashboardGetPins: getPins, dashboardUpdatePins: updatePins },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('DashboardPinToggle', () => {
  beforeEach(() => {
    getPins.mockReset();
    updatePins.mockReset();
  });

  it('requires a successful list load before replacing pins and can retry after failure', async () => {
    getPins.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([
      { itemType: 'page', itemId: '/messages' },
    ]);
    updatePins.mockResolvedValue([
      { itemType: 'page', itemId: '/messages' },
      { itemType: 'page', itemId: '/projects' },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><DashboardPinToggle itemType="page" itemId="/projects" label="Projects" /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'retry' }));
    expect(updatePins).not.toHaveBeenCalled();
    const pinButton = await screen.findByRole('button', { name: 'pin Projects' });
    await waitFor(() => expect(pinButton).toBeEnabled());
    fireEvent.click(pinButton);
    await waitFor(() => expect(updatePins).toHaveBeenCalledWith({ requestBody: { items: [
      { itemType: 'page', itemId: '/messages' },
      { itemType: 'page', itemId: '/projects' },
    ] } }));
  });
});
