/** What changing the project of a running session applies to. */
export enum ProjectChangeMode {
  /** The running usage record moves to the new project with everything used in it so far. */
  WHOLE_SESSION = 'whole-session',
  /** The running record ends and keeps its project; a continuation starts for the new one. */
  SPLIT = 'split',
}
