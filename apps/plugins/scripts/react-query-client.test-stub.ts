// Plugin unit tests import the full `@attraccess/plugins-frontend-ui` barrel, which reaches the core's
// generated API client through UserSearch / ResourceSelector. That client is gitignored and is not
// generated in the plugin CI job, so plugin vitest configs alias it to this empty module. Plugin tests
// never render those components; if one does, give it an explicit `vi.mock` instead.
export {};
