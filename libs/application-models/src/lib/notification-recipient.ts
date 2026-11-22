/** The account fields needed to notify someone by email, push or toast. Account records satisfy it structurally. */
export interface NotificationRecipient {
  id: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  locale: string;
}
