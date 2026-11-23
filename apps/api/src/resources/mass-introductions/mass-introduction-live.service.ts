import { Injectable, Optional } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ClusterService } from '../../cluster/cluster.service';
import { ClusterUserSubjects } from '../../live-updates/cluster-user-subjects';
import { MassIntroductionLiveEventDto } from './dtos/massIntroductionLiveEvent.dto';

/** Per-introducer realtime channel for their mass-introduction sessions, on every API instance. */
@Injectable()
export class MassIntroductionLiveService {
  private readonly subjects: ClusterUserSubjects<MassIntroductionLiveEventDto>;

  constructor(@Optional() cluster?: ClusterService) {
    this.subjects = new ClusterUserSubjects('mass-introduction', cluster);
  }

  public getIntroducerSubject(userId: number): Subject<{ data: MassIntroductionLiveEventDto }> {
    return this.subjects.subject(userId);
  }

  public emitToIntroducer(userId: number, event: MassIntroductionLiveEventDto): void {
    this.subjects.emit(userId, event);
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    this.subjects.deleteIfUnobserved(userId);
  }
}
