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
| **Credits per kWh**              | Credits charged per kilowatt-hour of metered electricity. Requires a meter in the resource flow (see below). Defaults to zero. |

> [!TIP]
> The charges add together. For example: 10 credits per usage + 2 credits per session minute for a 30-minute session + 3 credits per operating minute for 10 minutes of machine operation = 10 + 60 + 30 = 100 credits, before the user's billing factor.

Session duration and operating duration are rounded up independently to whole minutes. Exactly one minute remains one billed minute; zero recorded duration remains zero. Operating duration requires recorded operating-state observations from [flows](flows/node-types.md); starting a session alone does not establish that the machine is operating.

The fixed fee, both duration rates and the user's billing factor are saved when the session starts. Later configuration changes apply to new sessions. The saved factor applies to the total of the session's charges, including any custom billing items added by flows.

## Energy (per kWh)

Electricity can be billed per kilowatt-hour. Set the **per kWh** rate in the resource's **Billing** section (for example 0.30 EUR/kWh) and define the meter in the resource's flow with the **Metering** nodes. Without a complete meter, sessions on this resource cannot start while a rate is set.

- The rate is captured when a session starts; later changes only apply to new sessions.
- Amount = kWh x rate, rounded half-up to the currency minor unit once (1.5 kWh at 0.30 EUR/kWh = 0.45 EUR).
- The energy charge appears as its own **energy** line item on the bill, and the user's billing factor applies to it.
- If the final meter reading cannot be obtained, the base charge is settled and the energy charge stays **pending** in the resource's billing card until you retry or waive it.

See [Energy Metering & Billing per kWh](flows/energy-metering.md) for setup, lifecycle and examples.

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
- [Energy Metering](flows/energy-metering.md) -- Meter setup for per kWh billing
- [Transactions](billing/transactions.md) -- View transaction history
- [Resource Details](resources/resource-details.md) -- Resource configuration
- [Permissions](user-management/permissions.md) -- System permissions
