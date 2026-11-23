// Only these resource live events affect session and control state; health and other events need no refetch.
export const SESSION_EVENTS = new Set([
  'resource.usage.session_started',
  'resource.usage.session_ended',
  'resource.usage.session_taken_over',
  'resource.usage.session_extended',
]);
