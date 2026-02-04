# Authentik OIDC Permissions Example

This guide walks through a full example that syncs Authentik groups into Attraccess system
permissions via OIDC.

Goal:
- Group `vorstand` grants: billing, user management, system configuration.
- Group `werkstattleiter` grants: resource management.

## 1) Create groups in Authentik

1. Go to `Directory` → `Groups`.
2. Click `Create`.
3. Create the two groups:
   - `vorstand`
   - `werkstattleiter`

## 2) Assign users to groups

1. Go to `Directory` → `Users`.
2. Open a user.
3. Go to the `Groups` tab.
4. Click `Add to existing group` and select `vorstand` and/or `werkstattleiter`.

## 3) Create a scope mapping for roles

Attraccess reads roles from OIDC claims (e.g., `roles`, `groups`). We will emit a `roles`
claim that contains the Authentik group names.

1. Go to `Customization` → `Property Mappings`.
2. Click `Create` → `Scope Mapping`.
3. Use these fields:
   - Name: `attraccess-roles`
   - Scope name: `profile`
   - Expression:
     ```python
     return {
       "roles": list(request.user.ak_groups.all().values_list("name", flat=True))
     }
     ```
4. Save the mapping.

## 4) Create or update the OIDC provider

1. Go to `Applications` → `Applications`.
2. Click `Create with provider` (or open your existing app/provider).
3. Choose `OAuth2/OIDC` as the provider type.
4. In the provider configuration, add the `attraccess-roles` mapping under
   **Scope mappings**.
5. In **Redirect URIs**, enable regex matching and use a pattern like:
   `^http://localhost:3000/api/auth/sso/OIDC/1/callback(\\?.*)?$` (replace host and provider ID).
6. Save. Make sure `openid`, `email`, and `profile` are requested scopes.

You can use the app slug later for Attraccess auto-discovery.

## 5) Configure Attraccess OIDC provider

In Attraccess, go to **Settings → Authentication → SSO Providers**, create an OIDC
provider, and configure it with your Authentik endpoints. You can use the
**Auto-Discovery → Authentik** flow to fill in the URLs from the application slug.

Then set the permission mappings to connect Authentik groups to Attraccess system
permissions:

```json
{
  "canManageBilling": ["vorstand"],
  "canManageUsers": ["vorstand"],
  "canManageSystemConfiguration": ["vorstand"],
  "canManageResources": ["werkstattleiter"]
}
```

This mapping is evaluated on each login. If a user is removed from a group, the
corresponding permission is removed on their next login.

## 6) Verify the result

1. Log in to Attraccess using SSO.
2. Open the user profile in Attraccess and confirm permissions match the group.
3. Update group membership in Authentik and log in again to verify the sync.

## Notes

- Attraccess reads role/permission data from claims named `roles`, `groups`,
  `permissions`, `systemPermissions`, and some vendor-specific paths.
- If you want to send direct booleans instead of roles, return
  `systemPermissions` from the scope mapping. The mapping above is simpler and
  keeps Authentik as the source of truth for group membership.

See `user/sso-providers.md` for the general SSO provider setup steps and fields.

If you need permission changes to apply immediately when group memberships change,
see `user/sso-authentik-webhooks.md` for a webhook-based sync approach.
