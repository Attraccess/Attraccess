import { client } from '@attraccess/react-query-client';

const apiUrl = (path: string) => `${client.getConfig().baseUrl ?? ''}/api${path}`;

/** A stored form image; only the people who may see it get it, everyone else a 404. */
export const formImageUrl = (imageId: string) => apiUrl(`/forms/images/${encodeURIComponent(imageId)}`);

/** An image added through a reader handoff link: the link token is the authorisation. */
export const formPhotoImageUrl = (token: string, imageId: string) =>
  apiUrl(`/form-photo/${encodeURIComponent(token)}/images/${encodeURIComponent(imageId)}`);
