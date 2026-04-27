// Lightweight email format validator used by the user-facing forms
// FEATURE: Frontend form validation utilities for user inputs

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}
