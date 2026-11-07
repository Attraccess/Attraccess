import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PreStartService } from './pre-start.service';
import { SessionEndService } from './session-end.service';
import { publishHookServices } from './runtime';

/** Hands the hook services to the plain-function hooks once the Nest module is up (and takes them back on shutdown). */
@Injectable()
export class HookServicePublisher implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PreStartService) private readonly preStart: PreStartService,
    @Inject(SessionEndService) private readonly sessionEnd: SessionEndService,
  ) {}

  onModuleInit(): void {
    publishHookServices({ preStart: this.preStart, sessionEnd: this.sessionEnd });
  }

  onModuleDestroy(): void {
    publishHookServices(null);
  }
}
