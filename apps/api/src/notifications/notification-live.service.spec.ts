import { NotificationCategory } from './notification-types';
import { NotificationLiveService } from './notification-live.service';

describe('notification presence and subject lifecycle', () => {
  it('releases the last live subject and its web presence; offline notifications allocate no subject', () => {
    const service = new NotificationLiveService();
    const subject = service.getUserSubject(1);
    const first = subject.subscribe(),
      second = subject.subscribe();
    service.setUserPresent(1, true);
    first.unsubscribe();
    service.deleteSubjectIfUnobserved(1);
    expect(service.isUserPresent(1)).toBe(true);
    second.unsubscribe();
    service.deleteSubjectIfUnobserved(1);
    expect(service.isUserPresent(1)).toBe(false);
    service.emitToUser(1, { category: NotificationCategory.MESSAGES, title: 'Offline', body: '', severity: 'info' });
    expect(service['subjects'].size).toBe(0);
  });

  it('keeps a user present while any tab is visible and removes only the disconnected tab', () => {
    const service = new NotificationLiveService();
    service.setConnectionPresent(1, 'visible-tab', true);
    service.setConnectionPresent(1, 'hidden-tab', false);
    service.setUserPresent(1, false); // Legacy reports cannot suppress bundled presence.
    expect(service.isUserPresent(1)).toBe(true);
    service.setConnectionPresent(1, 'second-visible-tab', true);
    service.setConnectionPresent(1, 'visible-tab', false);
    expect(service.isUserPresent(1)).toBe(true);
    expect(service.isUserPresent(2)).toBe(false);
    service.setConnectionPresent(1, 'second-visible-tab', false);
    service.setConnectionPresent(1, 'second-visible-tab', false);
    expect(service.isUserPresent(1)).toBe(false);
    expect(service['visibleConnections'].size).toBe(0);
  });
});
