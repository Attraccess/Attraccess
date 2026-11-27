import type {
  AttractapConversionState,
  AttractapSecureConversionPatch,
  AttractapSecureConversionRecord,
  NewAttractapSecureConversion,
} from '@attraccess/application-models';

/** Conversions of readers to the secure profile. At most one is active per installation. */
export interface AttractapSecureConversionStore {
  findById(id: number): Promise<AttractapSecureConversionRecord | null>;
  /** The installation's active conversion, if any. */
  findActive(): Promise<AttractapSecureConversionRecord | null>;
  /** The newest conversion of a reader, active or not. */
  findLatestForReader(readerId: number): Promise<AttractapSecureConversionRecord | null>;
  /** Active conversions of the given readers (for list chips). */
  listActiveFor(readerIds: number[]): Promise<AttractapSecureConversionRecord[]>;
  /** Null when another conversion is already active (the one-active index refused it). */
  insert(conversion: NewAttractapSecureConversion, at: Date): Promise<AttractapSecureConversionRecord | null>;
  /**
   * Writes the patch only while the conversion is in one of `whenStates` (compare and set), so two messages or a
   * cancel and a reader report cannot both move it. With `onlyUnverified` it also applies only while the reader has
   * not verified its staging (the burn command leaves right after that). A terminal state clears `active`. Null when
   * it did not apply.
   */
  update(
    id: number,
    patch: AttractapSecureConversionPatch,
    whenStates: readonly AttractapConversionState[],
    onlyUnverified?: boolean,
  ): Promise<AttractapSecureConversionRecord | null>;
}

export const ATTRACTAP_SECURE_CONVERSION_STORE = Symbol.for('attraccess.attractap.secure-conversion-store');
