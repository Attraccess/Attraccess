/**
 * Since when the person has been using the machine. After a project switch the running record is a continuation:
 * its `startTime` is the switch, `sessionStartTime` the start of the session it continues.
 */
export function sessionStartOf<T>(usage: { startTime: T; sessionStartTime?: T | null }): T {
  return usage.sessionStartTime ?? usage.startTime;
}
