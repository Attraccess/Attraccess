/** Account failure state; timing, admission and lockout policy belong to the application. */
export abstract class RateLimitPersistence {
  abstract recordFailureState(userId: number, attempts: number, firstAt: Date): Promise<void>;
  abstract lockAccount(userId: number, until: Date): Promise<void>;
  abstract clearAccount(userId: number): Promise<void>;
}
