# Billing Configuration

You can enable and configure billing individually for each resource. Billing settings are found on the resource detail page.

## Setting Up Billing for a Resource

1. Navigate to the [detail page](resources/resource-details.md) of the resource
2. Scroll to the **Billing** section
3. Configure the billing model (see below)
4. Save the changes

<!-- TODO: Screenshot of billing configuration on resource detail page -->

## Billing Models

You can set one or both of the following options per resource:

| Setting | Description |
|---------|-------------|
| **Credits per Usage** | A flat number of credits charged for each usage session. The duration does not matter. |
| **Credits per Minute** | Credits charged for each minute of usage. The total charge depends on how long the session lasts. |

> [!TIP]
> If you set both values, users are charged the flat fee plus the time-based fee. For example: 10 credits per usage + 2 credits per minute for a 30-minute session = 10 + 60 = 70 credits.

## Example Configurations

| Use Case | Credits per Usage | Credits per Minute |
|----------|------------------:|-------------------:|
| Simple flat fee (e.g. workshop entry) | 50 | 0 |
| Time-based only (e.g. 3D printer) | 0 | 5 |
| Base fee + time (e.g. laser cutter) | 20 | 3 |

## User Credit Balance

Each user's current credit balance is displayed on their account page. Administrators with the **Manage Billing** permission can view and adjust balances for all users.

> [!NOTE]
> If a resource has no billing values configured (both set to 0), no credits are charged for usage sessions on that resource.

## Required Permission

Configuring billing settings requires the **Manage Billing** permission. See [Permissions](user-management/permissions.md).

## See Also

- [Billing Overview](billing/overview.md) -- How billing works
- [Transactions](billing/transactions.md) -- View transaction history
- [Resource Details](resources/resource-details.md) -- Resource configuration
- [Permissions](user-management/permissions.md) -- System permissions
