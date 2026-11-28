# Forms

<!-- llms-description: Introduces forms collected from users at points of resource use, including where a form applies, when it is shown, field types (including photos) and submissions. -->

Forms let you collect information from users when they interact with a resource. You define a form once and choose where it applies: one resource, every resource in a resource group, or every resource. A form can be required at different points during a usage session.

## What are Forms?

A form is a set of fields that users fill out during resource usage. For example, you might want to collect:

- The material being used on a laser cutter
- The weight of filament used on a 3D printer
- A project reference for billing purposes

## Where a Form Applies

Each form has a **scope**:

| Scope        | The form applies to                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Resource** | One resource                                                                                                     |
| **Group**    | Every resource in a [resource group](resources/resource-groups.md), including resources added to the group later |
| **Global**   | Every resource                                                                                                   |

Editing a form changes it everywhere it applies, in the web app and on Attractap readers. You do not have to maintain the same questionnaire on ten machines.

> [!NOTE]
> Group membership decides which group forms a resource asks for. When you add a resource to a group, the group's forms apply to it from then on. When you remove it, they no longer apply.

If a resource reaches the same form more than once, for example through two groups, the form is asked once. When several forms are required, global forms come first, then group forms, then the resource's own forms.

### Switching a Form Off or Overriding It for One Resource

On a resource's **Settings** → **Forms** page you see every form that applies to it, including inherited group and global forms. For each form you can:

- **Switch it off** for this resource. The form keeps applying everywhere else.
- **Override when it is required.** For each of Session Start, Session Takeover, Session End, Project switch (split) and Project change (whole session), choose **Inherit** (use the form's default), **Required** or **Not required**.

Only these settings can differ per resource. The name and the fields are always the same everywhere the form applies.

## When are Forms Shown?

A form sets a default for each point in the usage lifecycle. A resource can override these defaults (see above):

| Trigger                            | When it appears                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session Start**                  | When a user starts using the resource                                                                                                                                                                          |
| **Session Takeover**               | When a user takes over an active session from another user                                                                                                                                                     |
| **Session End**                    | When a user ends their usage session                                                                                                                                                                           |
| **Project switch (split)**         | When a user [splits their running session](resources/usage-tracking.md#changing-the-project-of-a-running-session) between projects. The answers belong to the part that starts then. No other forms are asked. |
| **Project change (whole session)** | When a user moves their whole running session to another project. The answers belong to the running session. No other forms are asked.                                                                         |

> [!TIP]
> Use **Session End** forms to collect data that is only known after usage, such as material consumption or print results.

## Field Types

Forms support the following field types:

| Type              | Description                      | Example                                                          |
| ----------------- | -------------------------------- | ---------------------------------------------------------------- |
| **Text**          | Free-text input                  | Material name, notes                                             |
| **Number**        | Numeric input                    | Duration, weight, quantity                                       |
| **Yes / No**      | Switch (yes/no)                  | "Workspace cleaned?", "Safety check done?", "I accept the terms" |
| **Single choice** | Dropdown with predefined options | Material type, project selection                                 |
| **Image**         | One or more photos (up to 10)    | Photo of damage, of the finished part                            |

> [!TIP]
> A **Yes / No** field marked as **Required** must be set to **Yes** (checked) before the form can be submitted. This is ideal for forcing users to accept terms and conditions or confirm safety instructions. See [Creating Forms](forms/creating-forms.md) for details.

An **Image** field lets users take or upload photos on the web and, on a touch reader, add them from their phone through a QR code. Only the submitter and users with the **Manage Resources** permission can see the photos. Details, privacy and storage notes are in [Creating Forms](forms/creating-forms.md).

Forms are shown for machine resources. A form with no required point is never shown.

## Forms on Attractap Readers

Readers fetch a form's fields live, so changes reach them the next time a form is requested. A reader shows at most four forms at a time. If more forms are required, the reader asks for the next forms after the first ones are filled in, and the session only starts or ends once all of them are done. This needs reader firmware that supports it; older firmware stops after the first four forms. Older firmware also cannot show **Image** fields: optional ones are skipped, and a required one has to be completed in the web app.

## Form Submissions

All form submissions are automatically linked to the usage session they belong to, and so to the resource they were given for. Administrators can view submitted data in the resource's usage history, and all submissions of a form across resources on the form's **Submissions** tab, filtered by resource if needed.

Each submission keeps a copy of the fields as they were when it was submitted. Later changes to the form do not change past answers.

When you delete a form, it no longer applies anywhere, but its submissions stay visible in the usage history and, read-only, at the form's old address.

<!-- TODO: Screenshot of a form submission in usage history -->

> [!NOTE]
> Form data can also be accessed by [Flows](flows/overview.md). This allows you to build automations that react to user input -- for example, setting billing items based on the material selected.

## See Also

- [Creating Forms](forms/creating-forms.md) -- How to create and configure forms
- [Usage Tracking](resources/usage-tracking.md) -- Viewing form submissions
- [Flows Overview](flows/overview.md) -- Automating with form data
- [Billing](billing/overview.md) -- Using forms for cost tracking
