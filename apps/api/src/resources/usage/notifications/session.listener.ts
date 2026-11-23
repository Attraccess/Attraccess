import { optionalUserDisplayName } from '@attraccess/shared';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageSessionEndedEvent, ResourceUsageSessionTakenOverEvent } from '../events/resource-usage.events';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';
import { createTranslator } from '../../../i18n/translate';
import * as en from './session.en.json';
import * as de from './session.de.json';
import * as durationEn from '../session-duration/session-duration.en.json';
import * as durationDe from '../session-duration/session-duration.de.json';

const t = createTranslator({ en, de });
const tDuration = createTranslator({ en: durationEn, de: durationDe });

@Injectable()
export class ResourceSessionNotificationListener {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @OnEvent(ResourceUsageSessionTakenOverEvent.EVENT_NAME)
  async handleTakenOver(event: ResourceUsageSessionTakenOverEvent): Promise<void> {
    const newUserName = optionalUserDisplayName(event.newUser);
    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [event.previousUser],
      actorId: event.newUser.id,
      title: (recipient) => t(recipient.locale, 'takeoverTitle', { resourceName: event.resource.name }),
      body: (recipient) => {
        const userName = newUserName ?? t(recipient.locale, 'fallbackUser');
        return t(recipient.locale, 'takeoverBody', { userName });
      },
      url: `/resources/${event.resource.id}`,
      severity: 'warning',
      sendEmail: (recipient, language) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_TAKEOVER, {
          resource: { id: event.resource.id, name: event.resource.name },
          takeover: { actorName: newUserName ?? t(language, 'fallbackUser') },
        }),
    });
  }

  @OnEvent(ResourceUsageSessionEndedEvent.EVENT_NAME)
  async handleSessionEnded(event: ResourceUsageSessionEndedEvent): Promise<void> {
    const recipient = event.usage.user;
    const resource = event.usage.resource;
    if (!recipient || !resource) {
      return;
    }

    // Only notify when someone else (or the system) ended the session — not the user themselves.
    if (event.endedBy !== null && event.endedBy.id === event.usage.userId) {
      return;
    }

    const endedByName = optionalUserDisplayName(event.endedBy);
    const autoReason = event.autoEndReason;
    const reasonKey = autoReason === 'maximum' ? 'Maximum' : 'Estimate';

    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_SESSION_ENDED,
      recipients: [recipient],
      actorId: event.endedBy?.id,
      title: (r) =>
        autoReason
          ? tDuration(r.locale, 'autoEndedTitle', { resourceName: resource.name })
          : t(r.locale, 'sessionEndedTitle', { resourceName: resource.name }),
      body: (r) => {
        // The server stopped it at its deadline: say why instead of "The system ended your session".
        if (autoReason) return tDuration(r.locale, `autoEndedBody${reasonKey}`, { resourceName: resource.name });
        const endedBy = endedByName ?? t(r.locale, 'fallbackSystem');
        return t(r.locale, 'sessionEndedBody', { endedBy });
      },
      url: `/resources/${resource.id}`,
      severity: 'warning',
      dedupeKey: `resource_session_ended:${event.usage.id}`,
      sendEmail: (r, language) =>
        this.notifications.sendEmailTemplate(r, NotificationCategory.RESOURCE_SESSION_ENDED, {
          resource: { id: resource.id, name: resource.name },
          session: {
            id: event.usage.id,
            endedAt: event.usage.endTime,
            endedBy: autoReason
              ? tDuration(language, `autoEndedActor${reasonKey}`)
              : (endedByName ?? t(language, 'fallbackSystem')),
          },
        }),
    });
  }
}
