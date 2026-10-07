// Password policy service: fetch policy row, seed defaults, run full server validation, manage per-role overrides
// FEATURE: Password policy core orchestration (shared validator + HIBP + zxcvbn + history + role overrides)

import {
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
} from '@attraccess/database-entities';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { RbacService } from '../rbac/rbac.service';
import { HibpClient } from './hibp.client';
import { PasswordPolicyProjectionImplementation } from './password-policy-projection';
import { ZxcvbnService } from './zxcvbn.service';

@Injectable()
export class PasswordPolicyService extends PasswordPolicyProjectionImplementation implements OnModuleInit {
  protected readonly logger = new Logger(PasswordPolicyService.name);

  constructor(
    @InjectRepository(PasswordPolicy)
    protected readonly repo: Repository<PasswordPolicy>,
    @InjectRepository(PasswordPolicyOverride)
    protected readonly overrideRepo: Repository<PasswordPolicyOverride>,
    @InjectRepository(PasswordHistory)
    protected readonly historyRepo: Repository<PasswordHistory>,
    @InjectRepository(AuthenticationDetail)
    protected readonly authDetailRepo: Repository<AuthenticationDetail>,
    protected readonly dataSource: DataSource,
    protected readonly hibp: HibpClient,
    protected readonly zxcvbn: ZxcvbnService,
    protected readonly rbacService: RbacService,
    @Optional() protected readonly identityAudit?: IdentityAuditService,
  ) {
    super();
  }
}

export {
  AuditContext,
  PartialPasswordPolicy,
  POLICY_FIELDS,
  ServerValidationResult,
  ValidateOptions,
} from './password-policy.service.feature-definitions';
