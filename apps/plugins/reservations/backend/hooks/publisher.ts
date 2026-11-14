import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReaderUiService } from '../reader-ui/reader-ui.service';
import { PreStartService } from './pre-start.service';
import { StartCapacityService } from './start-capacity.service';
import { SessionEndService } from './session-end.service';
import { publishHookServices } from './runtime';

/** Hands the hook services to the plain-function hooks once the Nest module is up (and takes them back on shutdown). */
@Injectable()
export class HookServicePublisher implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PreStartService) private readonly preStart: PreStartService,
    @Inject(StartCapacityService) private readonly startCapacity: StartCapacityService,
    @Inject(SessionEndService) private readonly sessionEnd: SessionEndService,
    @Inject(ReaderUiService) private readonly readerUi: ReaderUiService,
  ) {}

  onModuleInit(): void {
    publishHookServices({
      preStart: this.preStart,
      startCapacity: this.startCapacity,
      sessionEnd: this.sessionEnd,
      readerUi: this.readerUi,
    });
  }

  onModuleDestroy(): void {
    publishHookServices(null);
  }
}
