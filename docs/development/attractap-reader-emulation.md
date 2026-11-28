# Driving an emulated Attractap reader

Reader-side behaviour (pairing, session, upgrade) can be exercised against a dev API
without hardware. Write a scratch TypeScript harness outside the repo, bundle it with
`node_modules/.bin/esbuild --bundle --platform=node --packages=external --tsconfig=apps/api/tsconfig.app.json`
and run it with `NODE_PATH=<worktree>/node_modules`. Import the API's `pki`,
`session-framing`, `ws-byte-stream`, `pairing-protocol` (`deriveCode`) and
`identity-upgrade-proof` modules by absolute path.

## Pairing over the wire

1. Open a WebSocket with subprotocol `attractap-pairing.v1` and send `hello`, then
   `round`, `nonce` and `reveal`. Derive the code with `deriveCode`.
2. As an admin, `POST /api/attractap/pairings/resolve`, then
   `POST /api/attractap/pairings/approve` with `{ code, mode: 'new' }`.
3. Open a session WebSocket (`attractap-session.v1`) with a self-signed client
   certificate. It receives the CONTROL message `pairing.complete { readerId, certificate }`.
4. Re-pairing a revoked reader needs `mode: 'takeover'` with `targetReaderId`.

Application events on a session arrive as `{ event: 'EVENT', data: { type, payload } }`,
for example `READER_FIRMWARE_INFO`.

## Pitfalls

- Pairing is rate limited per IP (10 per 10 minutes). Bind each emulated client to a
  random `127.x.y.z` `localAddress` and connect to `127.0.0.1`.
- The credential history is an event log: an upgrade from P-256 to RSA shows
  `paired(P256), replaced(P256), paired(RSA)`.
- Lab Python tests only run through `nix flake check path:./apps/attractap-lab`;
  labgrid is not available in a plain venv.
- Jest with swc does not typecheck; `api:swagger-build` (webpack) does. Frontend
  tests are vitest (`pnpm nx test frontend -- <path>`).
- After changing the MCP tool surface, regenerate the manifest with
  `MCP_MANIFEST_WRITE=1 pnpm nx test api --testPathPatterns=mcp-manifest.drift`.
