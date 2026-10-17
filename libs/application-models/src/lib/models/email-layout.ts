export const EMAIL_LAYOUT_SINGLETON_ID = 'global';

export interface EmailLayout {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
