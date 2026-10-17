export interface Setting {
  id: number;
  parent: string | null;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}
