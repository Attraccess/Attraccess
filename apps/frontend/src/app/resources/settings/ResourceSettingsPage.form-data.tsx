import { UpdateResourceDto } from '@attraccess/react-query-client';
export type FormData = Omit<UpdateResourceDto, 'metadata'> & { metadata: Record<string, unknown> };
