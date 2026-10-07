import { _pinBackoffUntil } from './main.-pin-failures';

export function pinAllowed(): boolean {
  return Date.now() >= _pinBackoffUntil;
}
