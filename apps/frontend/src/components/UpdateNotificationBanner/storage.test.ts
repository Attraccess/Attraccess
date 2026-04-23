import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISMISSED_VERSION_STORAGE_KEY,
  clearDismissedVersion,
  readDismissedVersion,
  writeDismissedVersion,
} from './storage';

describe('update banner storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readDismissedVersion', () => {
    it('returns null when no dismissed version is stored', () => {
      expect(readDismissedVersion()).toBeNull();
    });

    it('returns the stored value for the known key', () => {
      localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, '0.1.2');
      expect(readDismissedVersion()).toBe('0.1.2');
    });

    it('swallows thrown errors and returns null', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
        throw new Error('disabled storage');
      });
      expect(readDismissedVersion()).toBeNull();
    });
  });

  describe('writeDismissedVersion', () => {
    it('persists the version under the storage key', () => {
      writeDismissedVersion('0.2.0');
      expect(localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY)).toBe('0.2.0');
    });

    it('does not throw when localStorage write fails', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('quota exceeded');
      });
      expect(() => writeDismissedVersion('0.2.0')).not.toThrow();
    });
  });

  describe('clearDismissedVersion', () => {
    it('removes the dismissed version', () => {
      localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, '0.1.1');
      clearDismissedVersion();
      expect(localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY)).toBeNull();
    });

    it('does not throw when localStorage remove fails', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
        throw new Error('disabled');
      });
      expect(() => clearDismissedVersion()).not.toThrow();
    });
  });
});
