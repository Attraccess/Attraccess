import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatApiUrl(hostname: string, port: string): string {
  return `${hostname}${port ? `:${port}` : ''}`;
}

export function debounce<F extends (...args: unknown[]) => unknown>(fn: F, delay: number) {
  let timeout: ReturnType<typeof setTimeout>;

  return function (...args: Parameters<F>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
