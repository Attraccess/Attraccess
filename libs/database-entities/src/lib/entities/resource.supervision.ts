/**
 * Controls who may start a usage session on a resource.
 */
export enum SupervisionMode {
  /** Today's behavior: only introduced users may start a session. */
  INTRODUCTION_REQUIRED = 'introduction_required',
  /** Introduced users alone; non-introduced users only with a present supervisor. */
  SUPERVISION_ALLOWED = 'supervision_allowed',
  /** Even introduced users need a present supervisor. */
  SUPERVISION_REQUIRED = 'supervision_required',
}

/**
 * Target of an auto-created introduction once the supervised-usage threshold is reached.
 */
export enum AutoIntroductionTarget {
  /** Create an introduction for this resource. */
  RESOURCE = 'resource',
  /** Create a group introduction instead of a resource introduction. */
  GROUP = 'group',
}
