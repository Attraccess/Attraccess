export interface ApiToken {
  id: number;
  name: string;
  permissionKeys: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface ApiTokenPage {
  data: ApiToken[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatedApiToken extends ApiToken {
  token: string;
}
