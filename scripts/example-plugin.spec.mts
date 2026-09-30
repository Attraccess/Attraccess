// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import HelloWorldPlugin from '../examples/plugin-hello-world/frontend/src/plugin';

const request = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/plugins-frontend-sdk', () => ({ createPluginApiClient: () => ({ request }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders greetings returned through the example plugin API client', async () => {
  request.mockResolvedValue({ greetings: ['Hello Jan', 'Hello team'] });
  const plugin = new HelloWorldPlugin();
  const route = plugin.getRoutes().find(({ path }) => path === '/hello-world');
  expect(route?.authRequired).toBe(true);
  render(route!.element);
  expect(await screen.findByText('Hello Jan')).toBeTruthy();
  expect(screen.getByText('Hello team')).toBeTruthy();
  expect(request).toHaveBeenCalledWith('/greetings');
});

it('shows a failed backend request instead of an empty greeting list', async () => {
  request.mockRejectedValue(new Error('Server unavailable'));
  render(new HelloWorldPlugin().getRoutes()[0].element);
  expect(await screen.findByText('Failed to load greetings: Server unavailable')).toBeTruthy();
});
