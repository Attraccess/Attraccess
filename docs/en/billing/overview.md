# Billing

Attraccess includes a billing system that lets you charge users for resource usage. Credits are deducted from user accounts when they use resources.

## How Billing Works

The billing system is based on **credits**. Each user has a credit balance. When a user finishes a usage session on a resource with billing enabled, credits are automatically deducted from their balance.

There are two billing models:

| Billing Model | How It Works |
|---------------|-------------|
| **Per Usage** | A flat fee is charged for each usage session, regardless of duration. |
| **Per Minute** | Credits are charged based on how long the resource was used. |

You can configure both models on the same resource. In that case, the user is charged the flat fee **plus** the time-based fee.

## Credit System

- Every user has a **credit balance** displayed on their account
- Credits are deducted automatically when a usage session ends
- If a user does not have enough credits, the session may still be recorded (depending on configuration)
- Administrators can manually adjust credit balances

<!-- TODO: Screenshot of user credit balance -->

## Payment Integration

Attraccess supports **SumUp** as a payment provider. When SumUp is configured, users can purchase credits through the application.

> [!NOTE]
> SumUp integration requires the `ATTRACCESS_PUBLIC_INTERNET_URL` environment variable to be set if your public URL differs from the internal `ATTRACCESS_URL`. See [Environment Variables](installation/environment-variables.md).

## Required Permission

To configure billing and view all transactions, a user needs the **Manage Billing** permission. See [Permissions](user-management/permissions.md) for details.

> [!TIP]
> Regular users can always see their own credit balance and transaction history, even without the Manage Billing permission.

## See Also

- [Billing Configuration](billing/configuration.md) -- Set up billing for resources
- [Transactions](billing/transactions.md) -- View billing history
- [Usage Tracking](resources/usage-tracking.md) -- How sessions are tracked
- [Permissions](user-management/permissions.md) -- System permissions
