# Billing Configuration
<!-- llms-description: How to enable billing per resource, choose billing models, bill metered consumption and manage user credit balances. -->

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
| **Price per measured value**              | Optional price for each named meter. Defaults to zero. |

> [!TIP]
> The charges add together. For example: 10 credits per usage + 2 credits per session minute for a 30-minute session + 3 credits per operating minute for 10 minutes of machine operation = 10 + 60 + 30 = 100 credits, before the user's billing factor.

Session duration and operating duration are rounded up independently to whole minutes. Exactly one minute remains one billed minute; zero recorded duration remains zero. Operating duration requires recorded operating-state observations from [flows](flows/node-types.md); starting a session alone does not establish that the machine is operating.

The fixed fee, both duration rates and the user's billing factor are saved when the session starts. Later configuration changes apply to new sessions. The saved factor applies to the total of the session's charges, including any custom billing items added by flows.

## Meter consumption

Each named meter can have an optional price per measured value in the resource's billing settings. Multiple meters can be billed in one session. Names and rates are captured at session start; only session consumption is charged, while idle consumption remains part of lifetime metrics. A rate of zero keeps tracking active without charging.

### Shared machines

On machines that allow several parallel sessions, each meter has an **Allocation** setting in its meter settings:

- **Shared and split** (default): the machine's consumption and operating time are split equally between the people active at the same time. Shares are kept exact and rounded once per time segment and charge type to whole credits, so the charged shares always add up to the segment total.
- **Measured per session**: every session gets its own measuring point and is settled on its own.

The mode is captured when a session starts; changes are recorded in the audit log. The per-use fee and session time are never split. Meters that cannot be read on demand need **Measured per session** or a rate of 0 on shared machines. See [Meters on shared machines](flows/energy-metering.md#meters-on-shared-machines) for segments, rounding, failed readings and examples.

See [Meters and consumption billing](flows/energy-metering.md) for flow setup, reporting modes, migration and settlement.

## Example Configurations

| Use Case                              | Credits per Usage | Credits per Minute |
| ------------------------------------- | ----------------: | -----------------: |
| Simple flat fee (e.g. workshop entry) |                50 |                  0 |
| Time-based only (e.g. 3D printer)     |                 0 |                  5 |
| Base fee + time (e.g. laser cutter)   |                20 |                  3 |

## User Credit Balance

Each user's current credit balance is displayed on their account page. Administrators with the **Manage Billing** permission can view and adjust balances for all users.

> [!NOTE]
> If all rates are zero, there are no automatic usage charges. Flows can still add custom billing items.

## Required Permission

Configuring billing settings requires the **Manage Billing** permission. See [Permissions](user-management/permissions.md).

## See Also

- [Billing Overview](billing/overview.md) -- How billing works
- [Meters](flows/energy-metering.md) -- Meter setup and consumption billing
- [Transactions](billing/transactions.md) -- View transaction history
- [Resource Details](resources/resource-details.md) -- Resource configuration
- [Permissions](user-management/permissions.md) -- System permissions
