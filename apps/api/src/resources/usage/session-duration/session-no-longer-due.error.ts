/** The session an automatic end was about to stop is no longer due (extended, or already ended). Not an error to report. */
export class SessionNoLongerDueError extends Error {
  constructor() {
    super('The session is not due to end automatically any more');
    this.name = 'SessionNoLongerDueError';
  }
}
