import { StandardModal as SharedStandardModal } from '@attraccess/plugins-frontend-ui';

/**
 * @deprecated Import `StandardModal` from `@attraccess/plugins-frontend-ui` instead. This alias
 * stays so existing plugins keep building; it requires `plugins-frontend-ui` to be shared with the host.
 */
// An import declaration (not `export … from`) so module federation rewrites it to the host's shared copy.
export const StandardModal = SharedStandardModal;
