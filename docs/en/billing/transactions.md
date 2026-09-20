# Billing Transactions

The Billing dashboard shows all credit transactions across the system. Use it to track charges, monitor resource usage costs and review individual user activity.

## Viewing Transactions

1. Click **Billing** in the sidebar
2. The transaction list is displayed in chronological order (newest first)

<!-- TODO: Screenshot of billing transactions dashboard -->

## Transaction Details

Each transaction contains the following information:

| Field         | Description                   |
| ------------- | ----------------------------- |
| **User**      | The user who was charged      |
| **Resource**  | The resource that was used    |
| **Credits**   | Number of credits charged     |
| **Timestamp** | When the transaction occurred |

For new usage sessions, completed duration charges retain the measured duration, rounded minutes and the rate saved at session start. Changing prices, billing factors or operating history later does not recalculate completed transactions.

For nonzero totals, the default email receipt shows separate session and operating-duration calculations and the saved billing factor. A zero-total transaction does not send a billing email. Customized email templates are preserved when the default receipt is upgraded; administrators can reset the template to its default to adopt the updated layout. Historical transactions are not rewritten.

## Filtering Transactions

You can filter the transaction list to find specific entries:

- Filter by **user** to see a specific person's charges
- Filter by **resource** to see how much a resource has been used
- Filter by **date range** to review a specific time period

> [!TIP]
> Use the transaction list to verify that billing is configured correctly for your resources. Start a test session and check whether the expected credits were charged.

## Required Permission

Viewing all transactions requires the **Manage Billing** permission. Regular users can view their own transaction history on their account page.

## See Also

- [Billing Overview](billing/overview.md) -- How billing works
- [Billing Configuration](billing/configuration.md) -- Set up billing for resources
- [Usage Tracking](resources/usage-tracking.md) -- Session tracking
- [Permissions](user-management/permissions.md) -- System permissions
