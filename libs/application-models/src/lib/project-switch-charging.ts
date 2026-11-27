/**
 * How a resource charges the continuation a project switch starts:
 *  - `continue`: no new fee per use; minutes are rounded on cumulative boundaries from the chain's first start, so
 *    all parts together never bill more minutes than one unsplit session;
 *  - `continue-per-part-rounding`: no new fee per use; every part rounds its own minutes up;
 *  - `new-session`: every part is billed like a session of its own, including the start balance check.
 */
export enum ProjectSwitchCharging {
  CONTINUE = 'continue',
  CONTINUE_PER_PART_ROUNDING = 'continue-per-part-rounding',
  NEW_SESSION = 'new-session',
}
