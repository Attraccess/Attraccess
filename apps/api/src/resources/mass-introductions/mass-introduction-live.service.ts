import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { MassIntroductionLiveEventDto } from './dtos/massIntroductionLiveEvent.dto';

/** Per-introducer realtime channel for their mass-introduction sessions. */
@Injectable()
export class MassIntroductionLiveService {
  private readonly subjects = new Map<number, Subject<{ data: MassIntroductionLiveEventDto }>>();

  public getIntroducerSubject(userId: number): Subject<{ data: MassIntroductionLiveEventDto }> {
    if (!this.subjects.has(userId)) {
      this.subjects.set(userId, new Subject<{ data: MassIntroductionLiveEventDto }>());
    }
    return this.subjects.get(userId);
  }

  public emitToIntroducer(userId: number, event: MassIntroductionLiveEventDto): void {
    this.subjects.get(userId)?.next({ data: event });
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    const subject = this.subjects.get(userId);
    if (subject && !subject.observed) {
      this.subjects.delete(userId);
    }
  }
}
