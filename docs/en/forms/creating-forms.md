# Creating Forms

You need the **Manage Resources** permission to create and edit forms.

## Creating a New Form

1. Navigate to the resource's [detail page](resources/resource-details.md)
2. Click the **Forms** tab
3. Click **Create Form**
4. Fill in the form settings:

| Setting | Required | Description |
|---------|----------|-------------|
| **Name** | Yes | A descriptive name for the form (e.g. "Material Usage") |
| **Required at** | Yes | When the form is shown: Session Start, Session Takeover, or Session End |

5. Click **Save**

<!-- TODO: Screenshot of form creation dialog -->

## Adding Fields

After creating a form, add fields to define what data to collect:

1. Click **Add Field**
2. Configure the field:

| Setting | Required | Description |
|---------|----------|-------------|
| **Name** | Yes | Field label shown to the user (e.g. "Material") |
| **Type** | Yes | Text, Number, Boolean, or Select |
| **Required** | No | Whether the user must fill in this field |
| **Description** | No | Help text displayed below the field |

3. Click **Save**

<!-- TODO: Screenshot of field configuration -->

### Required Boolean Fields (Consent / Acceptance)

When a **Boolean** field is marked as **Required**, the user must explicitly set it to **Yes** (checked) to submit the form. Leaving it at **No** will block submission with a validation error.

Use this pattern to force users to actively acknowledge something before proceeding -- for example:

- Accepting terms and conditions (AGB)
- Confirming safety instructions have been read
- Confirming a safety checklist has been completed

> [!NOTE]
> The label of a Boolean field is determined by the field's **Name**. You cannot set a separate custom label for the checkbox itself -- the field name is what the user sees next to the checkbox.

### Configuring Select Fields

When you choose **Select** as the field type, you need to define the available options:

1. Set the field type to **Select**
2. Add options -- each option needs a label that will be shown in the dropdown
3. Users will choose one of these options when filling out the form

> [!TIP]
> Use Select fields instead of Text fields when you want consistent, predefined answers -- for example, a list of available materials or machine profiles.

## Editing Fields

1. Open the form from the **Forms** tab
2. Click on the field you want to edit
3. Change the desired settings
4. Save the changes

## Deleting Fields

1. Open the form from the **Forms** tab
2. Click the delete icon on the field you want to remove
3. Confirm the deletion

> [!WARNING]
> Deleting a field does not remove data from existing form submissions. However, new submissions will no longer include this field.

## Deleting a Form

1. Open the **Forms** tab on the resource detail page
2. Click the delete icon on the form you want to remove
3. Confirm the deletion

## See Also

- [Forms Overview](forms/overview.md) -- What forms are and how they work
- [Detail Page](resources/resource-details.md) -- Resource detail page
- [Flows Overview](flows/overview.md) -- Using form data in automations
