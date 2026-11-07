import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReservationsApiError } from '../api';
import { useReservationsTranslations } from '../i18n';
import de from '../de.json';
import en from '../en.json';
import { describeError } from './errors';

const errorsOf = (messages: { errors: object }) => messages.errors as unknown as Record<string, string>;

afterEach(() => useTranslationState.setState({ language: 'en' }));

const translate = (language: 'en' | 'de') => {
  useTranslationState.setState({ language });
  return renderHook(() => useReservationsTranslations()).result.current.t;
};

describe('describeError', () => {
  it.each(['FEED_LIMIT', 'FEED_NOT_FOUND', 'INVALID_FEED'])('localises the iCal code %s', (code) => {
    const failure = new ReservationsApiError('English server text', 409, code);
    const german = describeError(failure, translate('de'));
    expect(german).not.toBe('English server text');
    expect(german).toBe(errorsOf(de)[code]);
    expect(describeError(failure, translate('en'))).toBe(errorsOf(en)[code]);
  });
});

describe('plural strings', () => {
  it('use the singular for one and the plural otherwise, in both languages', () => {
    const english = translate('en');
    expect(english('feeds.selection.groups', { count: 1 })).toBe('1 group');
    expect(english('feeds.selection.groups', { count: 3 })).toBe('3 groups');
    expect(english('errors.FUTURE_BOOKINGS_EXIST', { count: 1 })).toBe('There is 1 upcoming booking.');
    const german = translate('de');
    expect(german('feeds.selection.resources', { count: 1 })).toBe('1 Ressource');
    expect(german('settings.saved.bodyCancelled', { count: 2 })).toContain('2 kommende Buchungen');
  });
});
