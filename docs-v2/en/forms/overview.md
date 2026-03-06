# Forms

Forms let you collect information from users when they interact with a resource. Each form is attached to a specific resource and can be required at different points during a usage session.

## What are Forms?

A form is a set of fields that users fill out during resource usage. For example, you might want to collect:

- The material being used on a laser cutter
- The weight of filament used on a 3D printer
- A project reference for billing purposes

## When are Forms Shown?

Each form is configured to appear at a specific point in the usage lifecycle:

| Trigger | When it appears |
|---------|----------------|
| **Session Start** | When a user starts using the resource |
| **Session Takeover** | When a user takes over an active session from another user |
| **Session End** | When a user ends their usage session |

> [!TIP]
> Use **Session End** forms to collect data that is only known after usage, such as material consumption or print results.

## Field Types

Forms support the following field types:

| Type | Description | Example |
|------|-------------|---------|
| **Text** | Free-text input | Material name, notes |
| **Number** | Numeric input | Duration, weight, quantity |
| **Boolean** | Checkbox (yes/no) | "Workspace cleaned?", "Safety check done?" |
| **Select** | Dropdown with predefined options | Material type, project selection |

## Form Submissions

All form submissions are automatically linked to the usage session they belong to. Administrators can view submitted data in the resource's usage history.

<!-- TODO: Screenshot of a form submission in usage history -->

> [!NOTE]
> Form data can also be accessed by [Flows](flows/overview.md). This allows you to build automations that react to user input -- for example, setting billing items based on the material selected.

## See Also

- [Creating Forms](forms/creating-forms.md) -- How to create and configure forms
- [Usage Tracking](resources/usage-tracking.md) -- Viewing form submissions
- [Flows Overview](flows/overview.md) -- Automating with form data
- [Billing](billing/overview.md) -- Using forms for cost tracking
