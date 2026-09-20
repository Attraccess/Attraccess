# Billing Configuration

You can enable and configure billing individually for each resource. Billing settings are found on the resource detail page.

## Setting Up Billing for a Resource

1. Navigate to the [detail page](resources/resource-details.md) of the resource
2. Scroll to the **Billing** section
3. Configure the billing model (see below)
4. Save the changes

<!-- TODO: Screenshot of billing configuration on resource detail page -->

## Billing Models

You can combine the following options per resource:

| Setting                          | Description                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Credits per Usage**            | A flat number of credits charged for each usage session. The duration does not matter.                             |
| **Credits per Minute**           | Credits charged for each started minute of the usage session.                                                      |
| **Credits per Operating Minute** | Credits charged for each started minute of recorded machine operation attributed to the session. Defaults to zero. |

> [!TIP]
> The charges add together. For example: 10 credits per usage + 2 credits per session minute for a 30-minute session + 3 credits per operating minute for 10 minutes of machine operation = 10 + 60 + 30 = 100 credits, before the user's billing factor.

Session duration and operating duration are rounded up independently to whole minutes. Exactly one minute remains one billed minute; zero recorded duration remains zero. Operating duration requires recorded operating-state observations from [flows](flows/node-types.md); starting a session alone does not establish that the machine is operating.

The fixed fee, both duration rates and the user's billing factor are saved when the session starts. Later configuration changes apply to new sessions. The saved factor applies to the total of the session's charges, including any custom billing items added by flows.

## Example Configurations

| Use Case                              | Credits per Usage | Credits per Minute |
| ------------------------------------- | ----------------: | -----------------: |
| Simple flat fee (e.g. workshop entry) |                50 |                  0 |
| Time-based only (e.g. 3D printer)     |                 0 |                  5 |
| Base fee + time (e.g. laser cutter)   |                20 |                  3 |

## User Credit Balance

Each user's current credit balance is displayed on their account page. Administrators with the **Manage Billing** permission can view and adjust balances for all users.

> [!NOTE]
> If all three rates are zero, there are no automatic usage charges. Flows can still add custom billing items.

## Required Permission

Configuring billing settings requires the **Manage Billing** permission. See [Permissions](user-management/permissions.md).

## See Also

- [Billing Overview](billing/overview.md) -- How billing works
- [Transactions](billing/transactions.md) -- View transaction history
- [Resource Details](resources/resource-details.md) -- Resource configuration
- [Permissions](user-management/permissions.md) -- System permissions
