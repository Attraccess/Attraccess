/** Attempt every owned cleanup step, preserving the original work failure if any. */
export async function withDesktopCleanup<T>(
  work: () => Promise<T>,
  ...cleanup: (() => unknown | Promise<unknown>)[]
): Promise<T> {
  let result: T;
  let failed = false;
  let failure: unknown;
  try {
    result = await work();
  } catch (error) {
    failed = true;
    failure = error;
  }
  for (const dispose of cleanup) {
    try {
      await dispose();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) throw failure;
  return result;
}
