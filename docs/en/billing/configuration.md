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
| **Price per measured value**     | Optional price for each named meter. Defaults to zero.                                                             |

> [!TIP]
> The charges add together. For example: 10 credits per usage + 2 credits per session minute for a 30-minute session + 3 credits per operating minute for 10 minutes of machine operation = 10 + 60 + 30 = 100 credits, before the user's billing factor.

Session duration and operating duration are rounded up independently to whole minutes. Exactly one minute remains one billed minute; zero recorded duration remains zero. Operating duration requires recorded operating-state observations from [flows](flows/node-types.md); starting a session alone does not establish that the machine is operating.

The fixed fee, both duration rates and the user's billing factor are saved when the session starts. Later configuration changes apply to new sessions. The saved factor applies to the total of the session's charges, including any custom billing items added by flows. For a taken-over session, items you would normally add on stop come from the [Usage Takeover](flows/node-types.md#resource-usage-takeover) flow instead, because **Usage Stopped** does not run.

## Charging when a session is split between projects

The owner of a running session can [change its project](resources/usage-tracking.md#changing-the-project-of-a-running-session). Moving the **whole session** changes nothing about the bill: no new fee, no new rounding and no balance check, whatever this setting says. The session is billed once, when it ends, and counts for the new project.

With **Split from now**, each part is billed on its own transaction to the same user; "charged to a project" means it appears in that project's usage statistics, history and exports. **Charging when a session is split between projects** in the resource's billing settings decides how:

| Option                             | Fee per usage                | Rounding of session and operating minutes                         | Balance check at the split |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------- | -------------------------- |
| **Continue the session** (default) | Only once, on the first part | On cumulative boundaries from the session's first start           | No                         |
| **Continue, round each part**      | Only once, on the first part | Every part rounds up on its own: up to one extra minute per split | No                         |
| **Treat as a new session**         | On every part                | Every part rounds up on its own                                   | Yes, like a start          |

With **Continue the session**, a part's billed minutes are the started minutes from the session's first start to the end of the part, minus those up to the start of the part. All parts together therefore cost as many time credits as one session that was not split; the billing factor is rounded on the running total too. For example, with 10 credits per usage and 2 credits per minute, a split after 2.5 minutes of a 4-minute session bills 10 + 3 × 2 for the first part and 1 × 2 for the second: 18 credits, exactly as without the split. Recorded operating minutes follow the same rule.

Prices and the billing factor stay those saved when the session started; the option in effect is saved with each split. Meter consumption and items added by flows are billed on the part in which they occur; each meter share is rounded to whole credits per part, as for any two sessions, and on [shared machines](#shared-machines) the shares are rounded once per time segment, so a split adds a segment boundary. A part without any charge leaves no transaction.

### What the user sees

- **At a split** the web app shows **Project changed** with the charge for the part that ended, and says that the session continued. A part without a charge shows nothing.
- **While the session runs**, the **Live session** billing view of a continuation covers only the part since the latest split: **Time since project change** and **Estimated bill since the project change**. The estimate follows the option above, so it does not include a fee per usage or a started minute that an earlier part already paid. Apart from the owner, only billing and resource managers get this estimate.
- **When the session ends**, the **Session billing summary** shows what all its parts cost together, also when the last part cost nothing.
- **E-mail receipts** are sent for each charged part, like for a session of its own, with the times and the amount of that part.

## Meter consumption

Each named meter can have an optional price per measured value in the resource's billing settings. Multiple meters can be billed in one session. Names and rates are captured at session start; only session consumption is charged, while idle consumption remains part of lifetime metrics. A rate of zero keeps tracking active without charging.

### Shared machines

On machines that allow several parallel sessions, each meter has an **Allocation** setting in its meter settings:

- **Shared and split** (default): the meter's consumption is split equally between the people active at the same time. Shares are kept exact and rounded once per time segment to whole credits, so the charged shares always add up to the segment total.
- **Measured per session**: every session gets its own measuring point and is settled on its own.

The mode is captured when a session starts; changes are recorded in the audit log. Operating time is always split between the people active at the same time, the same way and independent of this setting. The per-use fee and session time are never split. A billed meter that cannot be read on demand (increment-only) can be used by only one session at a time unless it is set to **Measured per session**. See [Meters on shared machines](flows/energy-metering.md#meters-on-shared-machines) for segments, rounding, failed readings and examples.

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
