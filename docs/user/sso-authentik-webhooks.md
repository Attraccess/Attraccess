# Authentik Webhooks for Permission Sync

OIDC updates permissions only on login. To sync permission changes immediately when Authentik
group memberships change, set up an Authentik webhook that calls the Attraccess SSO
provisioning endpoint.

This guide assumes you already configured the OIDC provider and permission mappings in
Attraccess. If not, see `user/sso-authentik-permissions.md` first.

## How the Attraccess provisioning endpoint works

Attraccess exposes an endpoint that updates a user's permissions using either:
- a list of roles/groups (evaluated against the provider's permission mappings), or
- explicit permission booleans.

Endpoint:
```
POST /api/auth/sso/OIDC/:providerId/users/permissions
```

Authentication:
- `Authorization: Bearer <OIDC client secret>` or
- `x-api-key: <OIDC client secret>`

The client secret is the one configured in the Attraccess OIDC provider. It is used to
authorize provisioning requests.

### Payload fields

User lookup:
- `email` (recommended)
- `subject` (OIDC `sub` value)

Roles (evaluated against permission mappings):
- `roles`: array of strings

Optional explicit permissions:
- `canManageResources`
- `canManageSystemConfiguration`
- `canManageUsers`
- `canManageBilling`

Example (roles-based):
```json
{
  "email": "user@example.com",
  "roles": ["vorstand"]
}
```

Example (explicit permissions):
```json
{
  "email": "user@example.com",
  "canManageBilling": true,
  "canManageUsers": true,
  "canManageSystemConfiguration": true,
  "canManageResources": false
}
```

## Authentik webhook setup (step by step)

Authentik uses **Notification Transports + Notification Rules** to send webhooks. The UI
steps below are based on Authentik's event notification docs.

### 1) Create a webhook transport

1. Go to `Event` → `Notification Transports`.
2. Click `Create`.
3. Choose **Webhook (generic)** as the mode.
4. Set the **Webhook URL** to:
   ```
   https://<attraccess-host>/api/auth/sso/OIDC/<providerId>/users/permissions
   ```
   Note: Do not use `localhost` unless Authentik runs on the same host/network
   namespace as Attraccess. Use a hostname that the Authentik server can reach.
5. In **Webhook Header Mapping**, choose the header mapping from step 2.
6. In **Webhook Body Mapping**, choose the body mapping from step 2.
7. Save.

Authentik docs: [Notification transports](https://docs.goauthentik.io/sys-mgmt/events/transports)

### 2) Create the webhook mappings (headers + body)

1. Go to `Customization` → `Property Mappings`.
2. Click `Create` → **Webhook Header Mapping**.
3. Use this expression:
   ```python
   return {
     "Authorization": "Bearer <OIDC client secret>",
     "Content-Type": "application/json"
   }
   ```
4. Save.
5. Click `Create` → **Webhook Body Mapping**.
6. Use this expression:
   ```python
   return {
     "email": request.user.email,
     "roles": list(request.user.ak_groups.all().values_list("name", flat=True))
   }
   ```
7. Save.
8. Go back to the webhook transport and select these mappings.

Authentik docs: [Webhook mappings](https://docs.goauthentik.io/sys-mgmt/events/transports/#webhook-mappings)

### 3) Create a policy that detects group changes

1. Go to `Customization` → `Policies`.
2. Click `Create` → **Event Matcher**.
3. In the **Action** field, choose **Model Updated**. Group membership changes are stored
   as model updates in Authentik, so this is the most reliable trigger.
4. Save.

Authentik docs: [Notification rules](https://docs.goauthentik.io/sys-mgmt/events/notifications/)

### 4) Create a notification rule

1. Go to `Event` → `Notification Rules`.
2. Click `Create`.
3. Pick your webhook transport from step 1.
4. Save.
5. Expand the rule and click **Bind existing Policy/Group/User**.
6. Select the Event Matcher policy from step 3.
7. Select a group that always has at least one user (for example, an admins group).
8. Save.

Important: Authentik only sends notifications when a group is selected on the rule, and
that group must have at least one member.

Authentik docs: [Notification rules](https://docs.goauthentik.io/sys-mgmt/events/notifications/)

### Important notes

- Always send the full current role list so Attraccess can recompute permissions correctly.
- The user must already exist in Attraccess. The endpoint updates permissions only.
- If you change mappings in Attraccess, the webhook payload does not need to change.

## Quick test with curl

```bash
curl -X POST \
  "https://<attraccess-host>/api/auth/sso/OIDC/<providerId>/users/permissions" \
  -H "Authorization: Bearer <oidc-client-secret>" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","roles":["vorstand"]}'
```

## Troubleshooting

- If no webhook requests arrive at all, open `Event` → `Events` and confirm that a
  `Model Updated` event appears when you add/remove a user from a group.
- If the event exists but no webhook fires, double-check that the notification rule has
  a group selected and that the selected group has at least one member.
- If the request returns 401, verify the client secret matches the Attraccess OIDC provider.
- If permissions do not change, ensure the user exists in Attraccess and your permission
  mappings match the role names.
