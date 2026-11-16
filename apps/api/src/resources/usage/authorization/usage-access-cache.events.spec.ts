import { User } from '@attraccess/database-entities';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../../../metrics/metrics.service';
import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { VALKEY_CLIENT } from '../../../valkey/valkey.module';
import { ResourceChangedEvent } from '../../events/resource-changed.event';
import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';
import { UsageAccessCache } from './usage-access-cache';
import { UsageAccessRules } from './usage-access-rules';

// The invalidation handlers moved from ResourceUsageService to this collaborator (ATT-1213): Nest must still
// subscribe them, once, through the provider that owns the cache.
describe('UsageAccessCache invalidation through Nest events', () => {
  const user = { id: 7 } as User;
  const rules = { canControl: jest.fn().mockResolvedValue(true) };
  let module: TestingModule;
  let cache: UsageAccessCache;
  let events: EventEmitter2;

  beforeEach(async () => {
    rules.canControl.mockClear();
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        UsageAccessCache,
        { provide: UsageAccessRules, useValue: rules },
        {
          provide: ResourceRetrainingService,
          useValue: { getResourceRetrainingStatus: jest.fn().mockResolvedValue({ dueAt: null }) },
        },
        {
          provide: MetricsService,
          useValue: { authorizationCacheRequestsTotal: { inc: jest.fn() }, authorizationCacheSize: { set: jest.fn() } },
        },
        { provide: RbacService, useValue: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set()) } },
        { provide: VALKEY_CLIENT, useValue: null },
      ],
    }).compile();
    await module.init();
    cache = module.get(UsageAccessCache);
    events = module.get(EventEmitter2);
  });

  afterEach(() => module.close());

  it('drops the cached answers of a changed resource and keeps the others', async () => {
    await cache.canControllResource(1, user);
    await cache.canControllResource(2, user);
    expect(rules.canControl).toHaveBeenCalledTimes(2);

    events.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(1));
    await cache.canControllResource(1, user);
    await cache.canControllResource(2, user);

    expect(rules.canControl).toHaveBeenCalledTimes(3);
    expect(rules.canControl).toHaveBeenLastCalledWith(1, user, false, undefined);
  });

  it('drops the cached answers of a user whose permissions changed', async () => {
    await cache.canControllResource(1, user);

    events.emit(UserPermissionsChangedEvent.EVENT_NAME, new UserPermissionsChangedEvent(user.id));
    await cache.canControllResource(1, user);

    expect(rules.canControl).toHaveBeenCalledTimes(2);
  });

  it('is subscribed once per event', () => {
    expect(events.listenerCount(ResourceChangedEvent.EVENT_NAME)).toBe(1);
    expect(events.listenerCount(UserPermissionsChangedEvent.EVENT_NAME)).toBe(1);
  });
});
