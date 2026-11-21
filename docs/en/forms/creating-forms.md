# Creating Forms

<!-- llms-description: How to create, edit, move and delete forms and their fields for one resource, a resource group or every resource, which requires the Manage Resources permission. -->

You need the **Manage Resources** permission to create and edit forms.

## Creating a New Form

All forms are managed under **Devices** → **Forms** in the sidebar (`/forms`). You can also start from a resource: on its [detail page](resources/resource-details.md), open **Settings** → **Forms** and click **New form**. The new form then applies to that resource.

1. Open **Devices** → **Forms** in the sidebar
2. Click **New form**
3. Fill in the form settings:

| Setting                                  | Required | Description                                                                                                                  |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Form name**                            | Yes      | A descriptive name for the form (e.g. "Material Usage")                                                                      |
| **Defaults: when this form is required** | No       | Switches for session start, takeover and session end. A resource can override these defaults.                                |
| **Scope**                                | Yes      | Where the form applies: **Resource** (pick the resource), **Group** (pick the resource group) or **Global** (every resource) |

4. Add at least one field (see below)
5. Click **Save form**

The list on the Forms page shows each form's scope, its number of fields and the number of resources it applies to. Use the scope filter to find group or global forms.

<!-- TODO: Screenshot of form creation dialog -->

## Adding Fields

Fields define what data to collect. Add them while creating the form or later:

1. Click **Add field**
2. Configure the field:

| Setting         | Required | Description                                             |
| --------------- | -------- | ------------------------------------------------------- |
| **Label**       | Yes      | Field label shown to the user (e.g. "Material")         |
| **Type**        | Yes      | **Text**, **Number**, **Yes / No** or **Single choice** |
| **Required**    | No       | Whether the user must fill in this field                |
| **Description** | No       | Help text displayed below the field                     |

3. Click **Save form**

<!-- TODO: Screenshot of field configuration -->

### Required Yes / No Fields (Consent / Acceptance)

When a **Yes / No** field is marked as **Required**, the user must explicitly set it to **Yes** (checked) to submit the form. Leaving it at **No** will block submission with a validation error.

Use this pattern to force users to actively acknowledge something before proceeding -- for example:

- Accepting terms and conditions (AGB)
- Confirming safety instructions have been read
- Confirming a safety checklist has been completed

> [!NOTE]
> The text next to a Yes / No switch is the field's **Label**. You cannot set a separate custom label for the checkbox itself -- the field name is what the user sees next to the checkbox.

### Configuring Single Choice Fields

When you choose **Single choice** as the field type, you need to define the available options:

1. Set the field type to **Single choice**
2. Click **Add option** for each option and enter the text shown in the dropdown
3. Users will choose one of these options when filling out the form

> [!TIP]
> Use Single choice fields instead of Text fields when you want consistent, predefined answers -- for example, a list of available materials or machine profiles.

## Editing a Form

Open the form from **Devices** → **Forms**, or from the resource's **Settings** → **Forms**: open the **⋮** menu in the form's row and choose **Edit form**. The form page lists the resources the form applies to. When it applies to more than one resource, a notice reminds you that your changes apply to all of them.

### Moving a Form to Another Scope

You can change a form's scope at any time, for example to share a resource form with a whole group or to make it global. The form keeps its fields and its submissions, and [flows](flows/overview.md) that use its answers keep working.

When a resource is no longer in the new scope, its overrides for this form are removed.

## Editing Fields

1. Open the form
2. Change the field's settings in its card. Drag a field by its handle to reorder it.
3. Click **Save form**

## Deleting Fields

1. Open the form
2. Click **Delete field** on the field you want to remove. It is removed from the editor at once, without a confirmation.
3. Click **Save form**

> [!WARNING]
> Deleting a field does not remove data from existing form submissions. However, new submissions will no longer include this field.

## Switching a Form Off for One Resource

1. Open the resource's **Settings** → **Forms**
2. Use the switch next to the form to turn it off or on for this resource
3. To change when the form is required on this resource only, choose **Inherit**, **Required** or **Not required** for Session Start, Session Takeover and Session End

## Viewing Submissions

The **Submissions** tab of a form lists all its submissions, newest first, with date, user, resource and action. Expand a row to see the answers. Filter by resource to see the answers given on one resource. From a resource's **Settings** → **Forms**, **Submissions** in the **⋮** menu of a form's row opens this list already filtered to that resource.

## Deleting a Form

1. Open the form
2. Open the **⋮** menu next to the title and choose **Delete**
3. Confirm the deletion

The form is removed from every resource it applies to. Its submissions are kept and stay visible in the usage history. The form's old address (`/forms/<id>`) still lists them, read-only.

> [!NOTE]
> Deleting a resource group also deletes its group forms. Their submissions are kept.

## See Also

- [Forms Overview](forms/overview.md) -- What forms are and how they work
- [Detail Page](resources/resource-details.md) -- Resource detail page
- [Flows Overview](flows/overview.md) -- Using form data in automations
