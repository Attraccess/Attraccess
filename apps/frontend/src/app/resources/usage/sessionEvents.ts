// The running session continues under another project, as a record of its own.
export const PROJECT_SWITCHED_EVENT = 'resource.usage.project_switched';

// Only these resource live events affect session and control state; health and other events need no refetch.
export const SESSION_EVENTS = new Set([
  'resource.usage.session_started',
  'resource.usage.session_ended',
  'resource.usage.session_taken_over',
  PROJECT_SWITCHED_EVENT,
]);

// An extension only moves a running session's automatic end: who may start or control the machine, and whether it
// is in use, stay the same, so it refetches the session alone.
export const SESSION_EXTENDED_EVENT = 'resource.usage.session_extended';
