# Recording audit events

Core code records audit events in the service that owns a change, through one port:

```ts
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../audit/recorder/audit-event';

@Injectable()
export class MaintenanceService {
  constructor(@Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder) {}

  async archive(id: number, actor: AuditActor): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.update(Maintenance, id, { archivedAt: new Date() });
      await this.audit.record(
        {
          domain: 'resource',
          action: 'maintenance_schedule.updated',
          actor,
          subject: { type: 'resource', id },
          details: { scheduleId: id },
        },
        manager,
      );
    });
  }
}
```

- **Services record, controllers don't.** A controller builds the actor with `auditActorOf(req.user)`
  (identity events: `auditOriginOf(req)`, which adds the client address and user agent) and passes it to the
  service. Flows, MQTT, readers and plugins call the same service with their own actor, so every path is
  audited the same way. A guard test (`audit/audit-boundaries.spec.ts`) fails when a controller, route helper,
  guard, interceptor or strategy reaches the recorder directly.
- **Authentication events at the HTTP edge** (logins, lockouts, rate limits) go through `AuthAuditLogger`, the
  only audit dependency guards, interceptors and Passport strategies may have.
- **Pass the `EntityManager`** when the change runs in a transaction. The row is written in a savepoint of that
  transaction and commits or rolls back with the change. Without a manager the row is written on the separate
  audit connection.
- **The actor is the real origin.** Use `SYSTEM_AUDIT_ACTOR` (`id: null`, no authentication method) for changes
  no user started, or `{ id: userId, authenticationMethod: null }` for a reader acting for a linked user. Never
  reuse a request user outside its request.
- **`record()` does not throw.** An event the domain policy rejects, a full queue or a storage error is logged
  and counted in `attraccess_audit_records_dropped_total`; the change itself goes on. The one exception is
  `AuditTransactionAbortedError`, when SQLite discarded the caller's whole transaction.

## The event

`AuditEvent` (in `audit/recorder/audit-event.ts`) is the one event shape:

| Field         | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `domain`      | A core domain or a plugin's registered domain. The stored `pluginId` follows from it.   |
| `action`      | The stored action, prefix included (`identity.login`, `attractap.reader.revoked`).      |
| `operationId` | Optional. Generated when omitted; billing uses `billing-transaction-<id>`.              |
| `actor`       | `{ id, authenticationMethod, apiTokenId? }`.                                            |
| `subject`     | `{ type, id }`. Card events use `attractap.card`.                                       |
| `outcome`     | Defaults to `succeeded`. Only identity and administration events record other outcomes. |
| `request`     | Client address and user agent; stored for identity events only.                         |
| `details`     | Scalar values the domain policy in `audit/policies/` allows for the action.             |

Each domain's policy validates the event before it is stored. A new action or detail field needs an entry in
that policy first; otherwise the event is dropped as `invalid_event`.

Plugins keep using `PluginContext.audit`; the host maps those events onto the same envelope and recorder.
