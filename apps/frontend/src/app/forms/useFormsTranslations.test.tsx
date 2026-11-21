import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useFormsTranslations } from './useFormsTranslations';

it('resolves the shared API error texts that toast.apiError looks up under "api"', () => {
  const { result } = renderHook(() => useFormsTranslations());
  expect(result.current.tExists('api.generic.title')).toBe(true);
  expect(result.current.t('api.generic.title')).toBe('Server Error');
  expect(result.current.t('editor.save')).toBe('Save form');
});

it('leaves escaping to React, so a form called "A & B" is not shown as "A &amp; B"', () => {
  const { result } = renderHook(() => useFormsTranslations());
  expect(result.current.t('editor.deleteConfirmTitle', { formName: 'A & B' })).toBe('Delete A & B?');
});
