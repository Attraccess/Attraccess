/** Waits between the retries of a meter reading. */
export const sleepSeconds = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));
