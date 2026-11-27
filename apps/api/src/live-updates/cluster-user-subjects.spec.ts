import { Test } from '@nestjs/testing';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';
import { MassIntroductionLiveService } from '../resources/mass-introductions/mass-introduction-live.service';
import { ClusterUserSubjects } from './cluster-user-subjects';

describe('ClusterUserSubjects', () => {
  it('delivers to the user subject and ends every stream on completeAll', () => {
    const subjects = new ClusterUserSubjects<string>('test');
    const received: string[] = [];
    let completed = false;
    subjects.subject(7).subscribe({ next: ({ data }) => received.push(data), complete: () => (completed = true) });

    subjects.emit(7, 'one');
    subjects.completeAll();
    subjects.emit(7, 'after');

    expect(received).toEqual(['one']);
    expect(completed).toBe(true);
  });

  // QA finding (ATT-1163): an open `supervision/requests/live` response kept a stopping API instance from closing its
  // HTTP server, so a graceful stop never finished while a supervisor's stream was connected.
  it.each([
    ['supervision', SupervisionLiveService, (s: SupervisionLiveService) => s.getSupervisorSubject(3)],
    ['mass introduction', MassIntroductionLiveService, (s: MassIntroductionLiveService) => s.getIntroducerSubject(3)],
  ] as const)('ends the open %s streams when the app shuts down', async (_name, service, subjectOf) => {
    const moduleRef = await Test.createTestingModule({ providers: [service] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    let completed = false;
    (subjectOf as (s: unknown) => { subscribe: (o: object) => void })(app.get(service)).subscribe({
      complete: () => (completed = true),
    });

    await app.close();

    expect(completed).toBe(true);
  });
});
