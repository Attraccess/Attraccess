# Implementation Plan

- [x] 1. Create Session database entity and migration

  - Create Session entity with token, userId, userAgent, ipAddress, expiresAt, createdAt, lastAccessedAt fields
  - Generate TypeORM migration for the new Session table
  - Add appropriate indexes for token (unique), userId, and expiresAt columns
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Implement Session Service for token management

  - Create SessionService with methods for createSession, validateSession, refreshSession, revokeSession
  - Implement cryptographically secure token generation using crypto.randomBytes
  - Add session expiration logic and automatic cleanup of expired sessions
  - Include session metadata capture (userAgent, ipAddress) from request context
  - _Requirements: 1.1, 1.3, 1.4, 6.1, 6.5_

- [x] 3. Create Session-based Passport Strategy

  - Implement SessionStrategy extending PassportStrategy for session token validation
  - Add logic to extract tokens from both cookies and Authorization headers
  - Integrate with SessionService for token validation and user resolution
  - Handle session expiration and invalid token scenarios
  - _Requirements: 1.2, 1.3, 2.1, 2.2_

- [x] 4. Implement Dual Authentication Guard

  - Create DualAuthGuard that supports both cookie and header authentication
  - Implement priority logic: Authorization header takes precedence over cookies
  - Add proper error handling for authentication failures
  - Ensure compatibility with existing @Auth() decorator usage
  - _Requirements: 2.1, 2.2, 5.3_

- [x] 5. Update Authentication Controller for cookie support

  - Modify createSession endpoint to detect request type and set cookies for web browsers
  - Add logic to determine if request is programmatic vs web browser based
  - Implement secure cookie configuration using ATTRACCESS_URL for secure flag
  - Update refreshSession endpoint to handle both cookie and token refresh
  - Update endSession (logout) endpoint to clear cookies and revoke database sessions
  - _Requirements: 1.1, 1.4, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

- [x] 6. Update SSO Controller for cookie support

  - Modify OIDC callback endpoint to set cookies for web browser requests
  - Ensure SSO authentication follows same cookie/header logic as local authentication
  - Update redirect logic to handle cookie-based authentication
  - _Requirements: 1.1, 2.3, 4.1_

- [x] 7. Replace JWT Strategy with Session Strategy in authentication module

  - Update UsersAndAuthModule to use SessionStrategy instead of JwtStrategy
  - Remove JWT-related dependencies and imports
  - Update all guards and decorators to use the new session-based authentication
  - _Requirements: 5.2, 5.3_

- [x] 8. Update Frontend authentication logic

  - Remove localStorage token storage and management from useAuth hook
  - Update API client configuration to rely on automatic cookie handling
  - Remove manual token header setting in OpenAPI client
  - Update authentication initialization to check server-side session status
  - Modify logout logic to rely on server-side session clearing
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 9. Add comprehensive tests for session authentication

  - Write unit tests for SessionService covering token generation, validation, and cleanup
  - Create integration tests for DualAuthGuard with both cookie and header scenarios
  - Add end-to-end tests for complete login/logout flows with cookies
  - Test session expiration and automatic cleanup functionality
  - Verify security properties of cookies (httpOnly, secure, sameSite)
  - _Requirements: 3.1, 3.2, 3.3, 6.6_

- [x] 10-1 Run build and if any issues occur, fix them

  - run `pnpm nx run-many -t build` and if any issues occur, fix them

- [x] 10-2 Run typecheck and if any issues occur, fix them

  - run `pnpm nx run-many -t typecheck` and if any issues occur, fix them

- [x] 10-3 Run lint and if any issues occur, fix them

  - run `pnpm nx run-many -t lint` and if any issues occur, fix them

- [ ] 10-4 Run test and if any issues occur, fix them

  - run `pnpm nx run-many -t test` and if any issues occur, fix them

- [ ] 10-5 Run e2e and if any issues occur, fix them
  - run `pnpm nx run-many -t e2e` and if any issues occur, fix them
- [ ] 11. Update documentation and cleanup
  - Update OpenAPI documentation to reflect both authentication methods
  - Add examples for both cookie-based and token-based authentication
  - Remove references to JWT tokens in documentation
  - Update environment variable documentation for session configuration
  - _Requirements: 2.5_
