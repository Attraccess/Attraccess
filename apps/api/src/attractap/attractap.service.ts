import { Attractap, AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { AttractapCrashStorageImplementation } from './attractap-crash-storage';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapFirmwareService } from './firmware.service';

@Injectable()
export class AttractapService extends AttractapCrashStorageImplementation {
  protected readonly logger = new Logger(AttractapService.name);

  public constructor(
    @InjectRepository(NFCCard)
    protected readonly nfcCardRepository: Repository<NFCCard>,
    @InjectRepository(Attractap)
    protected readonly readerRepository: Repository<Attractap>,
    @InjectRepository(AttractapCrashReport)
    protected readonly crashReportRepository: Repository<AttractapCrashReport>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
    protected readonly coredumpSymbolicationService: CoredumpSymbolicationService,
    protected readonly firmwareService: AttractapFirmwareService,
    protected readonly notifications: NotificationDispatchService,
    protected readonly audit: AuditService,
  ) {
    super();
  }
}
