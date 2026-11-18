export enum ResourceMeteringSessionStatus {
  /** Metering is initialized; the usage is running (or being started). */
  Active = 'active',
  /** The final total was collected and the meter charge is part of the usage bill. */
  Settled = 'settled',
  /** The usage ended but no valid final total is available yet; retryable. */
  Pending = 'pending',
  /** The final total can no longer be obtained (or was rejected); needs an operator decision. */
  Failed = 'failed',
  /** An operator decided not to charge meter for this usage. */
  Waived = 'waived',
}
