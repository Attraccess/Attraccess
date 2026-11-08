/**
 * The texts of every reservation email, in English (the inline default) and German. A paragraph is
 * `[key, en, de, condition?]`; `{name}` placeholders are filled from PLACEHOLDERS (see build.ts). Admins can
 * edit all of it in the email template editor once the host has stored the templates.
 */
export type Condition = `if:${string}` | `unless:${string}`;
export type Paragraph = readonly [key: string, en: string, de: string, condition?: Condition];

export interface Button {
  key: string;
  en: string;
  de: string;
  /** Path after the application URL; Handlebars allowed. */
  path: string;
  condition?: Condition;
}

export interface TemplateSpec {
  readonly id: string;
  label: { en: string; de: string };
  subject: { en: string; de: string };
  paragraphs: readonly Paragraph[];
  buttons?: readonly Button[];
}

const OPEN: Button = {
  key: 'button_open',
  en: 'Open booking',
  de: 'Reservierung öffnen',
  path: '/reservations/{{reservation.id}}',
};

const CHECK_IN: readonly Paragraph[] = [
  [
    'check_in_off',
    'Check-in is not required: the booking stays yours until it ends, even if you do not start a session.',
    'Ein Check-in ist nicht erforderlich: Die Reservierung bleibt bis zum Ende bei dir, auch wenn du keine Sitzung startest.',
    'if:checkIn.off',
  ],
  [
    'check_in_required',
    'Check-in is required: start a session on the resource within {grace} after the start. Without a check-in the booking is released as a no-show.',
    'Ein Check-in ist erforderlich: Starte innerhalb von {grace} nach dem Beginn eine Sitzung an der Ressource. Ohne Check-in verfällt die Reservierung und der Zeitraum wird für andere freigegeben.',
    'if:checkIn.onNoEarly',
  ],
  [
    'check_in_required_early',
    'Check-in is required: start a session on the resource up to {early} before the start or within {grace} after the start. Without a check-in the booking is released as a no-show.',
    'Ein Check-in ist erforderlich: Starte bis zu {early} vor dem Beginn oder innerhalb von {grace} nach dem Beginn eine Sitzung an der Ressource. Ohne Check-in verfällt die Reservierung und der Zeitraum wird für andere freigegeben.',
    'if:checkIn.onWithEarly',
  ],
];

export const TEMPLATE_SPECS = [
  {
    id: 'pending-approval',
    label: { en: 'Booking request awaiting approval', de: 'Reservierungsanfrage wartet auf Genehmigung' },
    subject: { en: 'Booking request for {resource}', de: 'Reservierungsanfrage für {resource}' },
    paragraphs: [
      [
        'body',
        '<strong>{holder}</strong> requested <strong>{resource}</strong> for {when}. Please approve or reject the request.',
        '<strong>{holder}</strong> möchte <strong>{resource}</strong> für {when} reservieren. Bitte genehmige oder lehne die Anfrage ab.',
      ],
      ['note', 'Note: {note}', 'Hinweis: {note}', 'if:reservation.note'],
    ],
    buttons: [{ key: 'button', en: 'Review requests', de: 'Anfragen prüfen', path: '/reservations/manage' }],
  },
  {
    id: 'confirmed',
    label: { en: 'Booking confirmed', de: 'Reservierung bestätigt' },
    subject: { en: 'Booking confirmed: {resource}', de: 'Reservierung bestätigt: {resource}' },
    paragraphs: [
      [
        'body',
        'Your booking of <strong>{resource}</strong> for {when} is confirmed.',
        'Deine Reservierung von <strong>{resource}</strong> für {when} ist bestätigt.',
        'unless:reservation.viaApproval',
      ],
      [
        'body_approved',
        'Your booking of <strong>{resource}</strong> for {when} was approved.',
        'Deine Reservierung von <strong>{resource}</strong> für {when} wurde genehmigt.',
        'if:reservation.viaApproval',
      ],
      ['decision_comment', 'Comment: {decision}', 'Kommentar: {decision}', 'if:reservation.decisionReason'],
      ...CHECK_IN,
    ],
    buttons: [OPEN],
  },
  {
    id: 'rejected',
    label: { en: 'Booking rejected', de: 'Reservierung abgelehnt' },
    subject: { en: 'Booking rejected: {resource}', de: 'Reservierung abgelehnt: {resource}' },
    paragraphs: [
      [
        'body',
        'Your booking request for <strong>{resource}</strong> ({when}) was rejected.',
        'Deine Reservierungsanfrage für <strong>{resource}</strong> ({when}) wurde abgelehnt.',
      ],
      ['reason', 'Reason: {decision}', 'Grund: {decision}', 'if:reservation.decisionReason'],
    ],
    buttons: [OPEN],
  },
  {
    id: 'cancelled-by-manager',
    label: { en: 'Booking cancelled by a manager', de: 'Reservierung von Verwaltung storniert' },
    subject: { en: 'Booking cancelled: {resource}', de: 'Reservierung storniert: {resource}' },
    paragraphs: [
      [
        'body',
        'Your booking of <strong>{resource}</strong> ({when}) was cancelled by a manager.',
        'Deine Reservierung von <strong>{resource}</strong> ({when}) wurde von einer verwaltenden Person storniert.',
      ],
      ['reason', 'Reason: {cancel}', 'Grund: {cancel}', 'if:reservation.cancelReason'],
    ],
    buttons: [OPEN],
  },
  {
    id: 'ended-early',
    label: { en: 'Running booking ended early', de: 'Laufende Reservierung vorzeitig beendet' },
    subject: { en: 'Booking ended early: {resource}', de: 'Reservierung vorzeitig beendet: {resource}' },
    paragraphs: [
      [
        'body',
        'A manager ended your running booking of <strong>{resource}</strong>. It now ends at {end}.',
        'Eine verwaltende Person hat deine laufende Reservierung von <strong>{resource}</strong> vorzeitig beendet. Sie endet jetzt um {end}.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'removed',
    label: {
      en: 'Booking removed (reservations switched off)',
      de: 'Reservierung entfernt (Reservierungen deaktiviert)',
    },
    subject: { en: 'Booking removed: {resource}', de: 'Reservierung entfernt: {resource}' },
    paragraphs: [
      [
        'body',
        'Reservations were switched off for <strong>{resource}</strong>, so your booking ({when}) was cancelled.',
        'Reservierungen wurden für <strong>{resource}</strong> deaktiviert, daher wurde deine Reservierung ({when}) storniert.',
      ],
    ],
  },
  {
    id: 'expired',
    label: { en: 'Booking request expired', de: 'Reservierungsanfrage abgelaufen' },
    subject: { en: 'Booking request expired: {resource}', de: 'Reservierungsanfrage abgelaufen: {resource}' },
    paragraphs: [
      [
        'body',
        'Your request for <strong>{resource}</strong> ({when}) was not decided before it started and has expired.',
        'Deine Anfrage für <strong>{resource}</strong> ({when}) wurde vor dem Beginn weder genehmigt noch abgelehnt und ist abgelaufen.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'no-show',
    label: { en: 'Not checked in, booking released', de: 'Nicht eingecheckt, Reservierung verfallen' },
    subject: {
      en: 'Not checked in – booking released: {resource}',
      de: 'Nicht eingecheckt – Reservierung verfallen: {resource}',
    },
    paragraphs: [
      [
        'body',
        'You did not check in within {grace} after the start of your booking of <strong>{resource}</strong> ({when}). The booking was released as a no-show.',
        'Du hast dich nicht innerhalb von {grace} nach dem Beginn deiner Reservierung von <strong>{resource}</strong> ({when}) eingecheckt. Die Reservierung ist deshalb verfallen und der Zeitraum wurde für andere freigegeben.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'still-needed',
    label: { en: 'Reminder 48 h before: still needed?', de: 'Erinnerung 48 Std. vorher: noch benötigt?' },
    subject: { en: 'Do you still need {resource}?', de: 'Brauchst du {resource} noch?' },
    paragraphs: [
      [
        'body',
        'Your booking of <strong>{resource}</strong> for {when} starts within the next two days. Please tell us whether you still need it. If you do not answer, the booking stays.',
        'Deine Reservierung von <strong>{resource}</strong> für {when} beginnt in den nächsten zwei Tagen. Bitte gib uns Bescheid, ob du sie noch brauchst. Ohne Antwort bleibt die Reservierung bestehen.',
      ],
    ],
    buttons: [
      {
        key: 'button_keep',
        en: 'Keep booking',
        de: 'Reservierung behalten',
        path: '/reservations/{{reservation.id}}?action=keep',
      },
      {
        key: 'button_cancel',
        en: 'Cancel booking',
        de: 'Reservierung stornieren',
        path: '/reservations/{{reservation.id}}?action=cancel',
      },
    ],
  },
  {
    id: 'reminder-24h',
    label: { en: 'Reminder 24 h before', de: 'Erinnerung 24 Std. vorher' },
    subject: { en: 'Reminder: {resource} from {start}', de: 'Erinnerung: {resource} ab {start}' },
    paragraphs: [
      [
        'body',
        'You have booked <strong>{resource}</strong> for {when}.',
        'Du hast <strong>{resource}</strong> für {when} reserviert.',
      ],
      ...CHECK_IN,
    ],
    buttons: [OPEN],
  },
  {
    id: 'maintenance-affected',
    label: { en: 'Maintenance affects a booking', de: 'Wartung betrifft eine Reservierung' },
    subject: {
      en: 'Maintenance affects your booking: {resource}',
      de: 'Wartung betrifft deine Reservierung: {resource}',
    },
    paragraphs: [
      [
        'body_until',
        '<strong>{resource}</strong> is in maintenance from {mstart} until {mend}.',
        '<strong>{resource}</strong> befindet sich ab {mstart} bis {mend} in Wartung.',
        'if:maintenance.hasEnd',
      ],
      [
        'body_open_end',
        '<strong>{resource}</strong> is in maintenance from {mstart} (no end announced yet).',
        '<strong>{resource}</strong> befindet sich ab {mstart} (noch ohne angekündigtes Ende) in Wartung.',
        'unless:maintenance.hasEnd',
      ],
      [
        'affected_one',
        'Your booking ({bookings}) overlaps this period and was not cancelled automatically. You may not be able to use the resource.',
        'Deine Reservierung ({bookings}) überschneidet sich mit diesem Zeitraum und wurde nicht automatisch storniert. Möglicherweise kannst du die Ressource nicht nutzen.',
        'if:maintenance.single',
      ],
      [
        'affected_many',
        'These bookings of yours overlap this period and were not cancelled automatically: {bookings}. You may not be able to use the resource.',
        'Diese Reservierungen von dir überschneiden sich mit diesem Zeitraum und wurden nicht automatisch storniert: {bookings}. Möglicherweise kannst du die Ressource nicht nutzen.',
        'unless:maintenance.single',
      ],
      ['reason', 'Reason: {mreason}', 'Grund: {mreason}', 'if:maintenance.reason'],
    ],
    buttons: [
      { ...OPEN, condition: 'if:maintenance.single' },
      {
        key: 'button_mine',
        en: 'Open my bookings',
        de: 'Meine Reservierungen öffnen',
        path: '/reservations',
        condition: 'unless:maintenance.single',
      },
    ],
  },
  {
    id: 'health-unhealthy',
    label: { en: 'Resource has a problem', de: 'Ressource hat ein Problem' },
    subject: { en: '{resource} has a problem', de: '{resource} hat ein Problem' },
    paragraphs: [
      [
        'body',
        '<strong>{resource}</strong> was reported as unhealthy. Your booking ({when}) is affected and may not be usable.',
        '<strong>{resource}</strong> wurde als gestört gemeldet. Deine Reservierung ({when}) ist betroffen und kann möglicherweise nicht genutzt werden.',
      ],
      ['details', 'Details: {details}', 'Details: {details}', 'if:health.reason'],
    ],
    buttons: [OPEN],
  },
  {
    id: 'health-recovered',
    label: { en: 'Resource works again', de: 'Ressource funktioniert wieder' },
    subject: { en: '{resource} works again', de: '{resource} funktioniert wieder' },
    paragraphs: [
      [
        'body',
        '<strong>{resource}</strong> is healthy again. Your booking ({when}) can go ahead.',
        '<strong>{resource}</strong> funktioniert wieder. Deine Reservierung ({when}) kann stattfinden.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'handover',
    label: { en: 'Reserved soon (to the current user)', de: 'Bald reserviert (an die aktuelle Person)' },
    subject: { en: '{resource} is reserved soon', de: '{resource} ist bald reserviert' },
    paragraphs: [
      [
        'body',
        '<strong>{resource}</strong> is reserved from {start}. Please end your session in time.',
        '<strong>{resource}</strong> ist ab {start} reserviert. Bitte beende deine Sitzung rechtzeitig.',
      ],
    ],
  },
  {
    id: 'overrun-holder',
    label: {
      en: 'Booking started, resource still in use (to the holder)',
      de: 'Reservierung begonnen, Ressource noch belegt (an die Buchenden)',
    },
    subject: { en: '{resource} is still in use', de: '{resource} ist noch in Benutzung' },
    paragraphs: [
      [
        'body',
        "Your booking of <strong>{resource}</strong> has started ({when}), but another user's session is still running. The session is not ended automatically; the resource should be free shortly.",
        'Deine Reservierung von <strong>{resource}</strong> hat begonnen ({when}), aber die Sitzung einer anderen Person läuft noch. Die Sitzung wird nicht automatisch beendet; die Ressource sollte in Kürze frei sein.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'overrun-user',
    label: {
      en: 'Booking started, please finish (to the current user)',
      de: 'Reservierung begonnen, bitte beenden (an die aktuelle Person)',
    },
    subject: { en: 'Please finish on {resource}', de: 'Bitte beende die Nutzung von {resource}' },
    paragraphs: [
      [
        'body',
        '<strong>{resource}</strong> has been reserved since {start} (until {end}). Please end your session now; it is not ended automatically.',
        '<strong>{resource}</strong> ist seit {start} reserviert (bis {end}). Bitte beende deine Sitzung jetzt; sie wird nicht automatisch beendet.',
      ],
    ],
  },
  {
    id: 'override-holder',
    label: { en: 'Started during a booking (to the holder)', de: 'Start trotz Reservierung (an die Buchenden)' },
    subject: {
      en: '{resource} was started during your booking',
      de: '{resource} wurde während deiner Reservierung gestartet',
    },
    paragraphs: [
      [
        'body',
        '{actor} (a manager) started <strong>{resource}</strong> during your booking ({when}).',
        '{actor} (verwaltende Person) hat <strong>{resource}</strong> während deiner Reservierung ({when}) gestartet.',
      ],
    ],
    buttons: [OPEN],
  },
  {
    id: 'override-managers',
    label: { en: 'Started during a booking (to the managers)', de: 'Start trotz Reservierung (an die Verwaltung)' },
    subject: { en: 'Override start on {resource}', de: 'Start trotz Reservierung an {resource}' },
    paragraphs: [
      [
        'body',
        '{actor} started <strong>{resource}</strong> during the booking of {holder} ({when}).',
        '{actor} hat <strong>{resource}</strong> während der Reservierung von {holder} ({when}) gestartet.',
      ],
    ],
    buttons: [{ key: 'button', en: 'Open reservations', de: 'Reservierungen öffnen', path: '/reservations/manage' }],
  },
] as const satisfies readonly TemplateSpec[];
