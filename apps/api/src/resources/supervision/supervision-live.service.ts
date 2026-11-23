import { Injectable, Optional } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ClusterService } from '../../cluster/cluster.service';
import { ClusterUserSubjects } from '../../live-updates/cluster-user-subjects';
import { SupervisionLiveEventDto } from './dtos/supervisionLiveEvent.dto';

/**
 * Per-supervisor realtime channel for supervision approval requests.
 *
 * Each supervisor gets an on-demand RxJS Subject that the SSE endpoints subscribe to and the supervision service
 * pushes events into. Events reach the supervisor's streams on every API instance (ATT-1163).
 */
@Injectable()
export class SupervisionLiveService {
  private readonly subjects: ClusterUserSubjects<SupervisionLiveEventDto>;

  constructor(@Optional() cluster?: ClusterService) {
    this.subjects = new ClusterUserSubjects('supervision', cluster);
  }

  public getSupervisorSubject(userId: number): Subject<{ data: SupervisionLiveEventDto }> {
    return this.subjects.subject(userId);
  }

  public emitToSupervisor(userId: number, event: SupervisionLiveEventDto): void {
    this.subjects.emit(userId, event);
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    this.subjects.deleteIfUnobserved(userId);
  }
}
