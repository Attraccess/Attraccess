import { act, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Waits for all loading states to be removed from the DOM
 */
export async function waitForLoadingToFinish() {
  await act(async () => {
    if (screen.queryAllByRole('status').length) {
      await waitForElementToBeRemoved(() => screen.queryAllByRole('status'), {
        timeout: 4000,
      });
    }
  });
}

/**
 * Creates a mock error response
 */
export function createErrorResponse(message: string, statusCode = 500): { message: string; statusCode: number } {
  return {
    message,
    statusCode,
  };
}

/**
 * Creates a mock API error
 */
export function createApiError(message: string, statusCode = 500): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

/**
 * Waits for a specific time in milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats a date for comparison in tests
 */
export function formatTestDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Creates a mock file for testing file uploads
 */
export function createMockFile(name = 'test.jpg', type = 'image/jpeg', size = 1024): File {
  return new File(['test'], name, { type });
}

/**
 * Creates a mock response for testing fetch requests
 */
export function createMockResponse<T>(data: T, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

/**
 * Creates a mock event object
 */
export function createMockEvent(
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: Record<string, any> = {}
): Partial<Event> {
  return {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...values,
  };
}

/**
 * Creates a mock keyboard event
 */
export function createMockKeyboardEvent(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: Record<string, any> = {}
): Partial<KeyboardEvent> {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...values,
  };
}
