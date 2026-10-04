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
});
