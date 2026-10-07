import { EmailTemplateType, Resource, ResourceHealthStatus, User } from '@attraccess/database-entities';
import { EmailAccountNotificationsImplementation } from './email-account-notifications';
export abstract class EmailResourceNotificationsImplementation extends EmailAccountNotificationsImplementation {
  async sendResourceHealthChangedEmail(
    user: User,
    resource: Pick<Resource, 'id' | 'name'>,
    change: {
      status: ResourceHealthStatus;
      previousStatus: ResourceHealthStatus | null;
      reason: string | null;
      identifier: string;
    },
  ) {
    if (!user?.email) {
      return;
    }

    const base = await this.getBaseContext(user);
    const becameUnhealthy = change.status === ResourceHealthStatus.UNHEALTHY;
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      health: {
        status: change.status,
        previousStatus: change.previousStatus ?? 'unknown',
        reason: change.reason,
        identifier: change.identifier,
        isDegraded: becameUnhealthy,
        headerColor: becameUnhealthy ? '#B91C1C' : '#047857',
      },
    };

    await this.sendEmail(user, EmailTemplateType.RESOURCE_HEALTH_CHANGED, context);
  }

  async sendUserRetrainingEmail(
    user: User,
    target: { id: number; name: string; isGroup: boolean },
    info: { reason: 'age' | 'inactivity' | null; blocksAccess: boolean },
  ) {
    if (!user?.email) {
      return;
    }

    const base = await this.getBaseContext(user);
    const path = target.isGroup ? 'resource-groups' : 'resources';
    const resourceUrl = `${base.host.frontend}/${path}/${target.id}`;

    const context = {
      ...base,
      resource: {
        id: target.id,
        name: target.name,
        url: resourceUrl,
      },
      retraining: {
        isAge: info.reason === 'age',
        isInactivity: info.reason === 'inactivity',
        blocksAccess: info.blocksAccess,
      },
    };

    await this.sendEmail(user, EmailTemplateType.USER_RETRAINING_REQUIRED, context);
  }

  async sendMaintenanceRequestedEmail(
    recipient: User,
    resource: Pick<Resource, 'id' | 'name'>,
    request: { id: number; reason: string; requestedBy: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      request: {
        id: request.id,
        reason: request.reason,
        requestedBy: request.requestedBy,
      },
    };

    await this.sendEmail(recipient, EmailTemplateType.MAINTENANCE_REQUEST_CREATED, context);
  }

  async sendAccessChangeEmail(recipient: User, accessChange: { title: string; body: string; url?: string }) {
    const resolvedRecipient = recipient?.email
      ? recipient
      : await this.userRepository.findOne({ where: { id: recipient.id } });

    if (!resolvedRecipient?.email) {
      return;
    }

    const base = await this.getBaseContext(resolvedRecipient);
    const url = accessChange.url ? new URL(accessChange.url, base.host.frontend).toString() : undefined;

    const context = {
      ...base,
      accessChange: {
        title: accessChange.title,
        body: accessChange.body,
        url,
      },
    };

    await this.sendEmail(resolvedRecipient, EmailTemplateType.ACCESS_CHANGE, context);
  }
}
