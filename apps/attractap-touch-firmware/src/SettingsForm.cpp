#include "SettingsForm.h"
#include "KeyboardManager.h"

SettingsForm::SettingsForm()
    : formContainer(nullptr),
      saveButton(nullptr),
      statusLabel(nullptr),
      prefsNamespace(""),
      keyboardManager(nullptr),
      keyboardVisible(false),
      activeTextArea(nullptr),
      onFieldValidation(nullptr),
      onSave(nullptr)
{
}

SettingsForm::~SettingsForm()
{
    // Note: LVGL objects are managed by parent-child hierarchy
}

void SettingsForm::setPreferencesNamespace(const String &ns)
{
    prefsNamespace = ns;
    Serial.printf("SettingsForm: Set preferences namespace to: %s\n", ns.c_str());
}

void SettingsForm::setKeyboardManager(KeyboardManager *keyboardMgr)
{
    keyboardManager = keyboardMgr;
}

void SettingsForm::addField(const FormField &field)
{
    fields.push_back(field);
    Serial.printf("SettingsForm: Added field: %s (%s)\n", field.id.c_str(), field.label.c_str());
}

void SettingsForm::clearFields()
{
    fields.clear();
    Serial.println("SettingsForm: Cleared all fields");
}

void SettingsForm::setFieldValidationCallback(FieldValidationCallback callback)
{
    onFieldValidation = callback;
}

void SettingsForm::setSaveCallback(SaveCallback callback)
{
    onSave = callback;
}

lv_obj_t *SettingsForm::create(lv_obj_t *parent)
{
    if (!parent)
    {
        Serial.println("SettingsForm: Error - parent is null");
        return nullptr;
    }

    // Use parent directly as the form container (no wrapping box)
    formContainer = parent;

    // Create form fields directly on parent
    int yOffset = 70; // Start below header (50px + 20px margin)
    for (auto &field : fields)
    {
        createFormField(field, parent, yOffset);
    }

    // Create save button
    saveButton = lv_btn_create(parent);
    lv_obj_set_size(saveButton, 120, 40);
    lv_obj_align(saveButton, LV_ALIGN_TOP_MID, 0, yOffset + 20);
    lv_obj_set_style_bg_color(saveButton, lv_color_hex(0x00AA44), 0);
    lv_obj_set_style_border_width(saveButton, 0, 0);
    lv_obj_add_event_cb(saveButton, onSaveButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *saveLabel = lv_label_create(saveButton);
    lv_label_set_text(saveLabel, "Save Settings");
    lv_obj_center(saveLabel);
    lv_obj_set_style_text_color(saveLabel, lv_color_hex(0xFFFFFF), 0);

    // Create status label
    statusLabel = lv_label_create(parent);
    lv_label_set_text(statusLabel, "");
    lv_obj_align(statusLabel, LV_ALIGN_TOP_MID, 0, yOffset + 75);
    lv_obj_set_style_text_color(statusLabel, lv_color_hex(0x00AA44), 0);
    lv_obj_set_style_text_align(statusLabel, LV_TEXT_ALIGN_CENTER, 0);

    Serial.printf("SettingsForm: Created form with %d fields\n", (int)fields.size());

    return formContainer;
}

void SettingsForm::createFormField(FormField &field, lv_obj_t *parent, int &yOffset)
{
    // Create field label with margins
    field.labelObj = lv_label_create(parent);
    lv_label_set_text(field.labelObj, (field.label + ":").c_str());
    lv_obj_set_style_text_color(field.labelObj, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(field.labelObj, LV_ALIGN_TOP_LEFT, 20, yOffset);

    yOffset += 25;

    // Create input field with margins
    field.inputObj = lv_textarea_create(parent);
    lv_obj_set_size(field.inputObj, LV_PCT(83), 40); // Reduced width to account for margins
    lv_obj_align(field.inputObj, LV_ALIGN_TOP_LEFT, 20, yOffset);
    lv_obj_set_style_bg_color(field.inputObj, lv_color_hex(0x404040), 0);
    lv_obj_set_style_text_color(field.inputObj, lv_color_hex(0xFFFFFF), 0);

    // Configure field based on type
    switch (field.type)
    {
    case FIELD_NUMBER:
        lv_textarea_set_accepted_chars(field.inputObj, "0123456789");
        break;
    case FIELD_PASSWORD:
        lv_textarea_set_password_mode(field.inputObj, true);
        break;
    case FIELD_TEXT:
    default:
        // No special configuration for text fields
        break;
    }

    if (field.maxLength > 0)
    {
        lv_textarea_set_max_length(field.inputObj, field.maxLength);
    }

    // Store field reference in the input object's user data
    lv_obj_set_user_data(field.inputObj, &field);
    lv_obj_add_event_cb(field.inputObj, onFieldClicked, LV_EVENT_CLICKED, this);

    yOffset += 60; // Space for next field
}

void SettingsForm::loadValues()
{
    if (prefsNamespace.isEmpty())
    {
        Serial.println("SettingsForm: Warning - no preferences namespace set");
        return;
    }

    preferences.begin(prefsNamespace.c_str(), true); // Read-only

    for (auto &field : fields)
    {
        String value = preferences.getString(field.id.c_str(), field.defaultValue);
        if (field.inputObj)
        {
            lv_textarea_set_text(field.inputObj, value.c_str());
        }
        Serial.printf("SettingsForm: Loaded %s = %s\n", field.id.c_str(), value.c_str());
    }

    preferences.end();
}

void SettingsForm::saveValues()
{
    if (!validateAllFields())
    {
        return;
    }

    if (prefsNamespace.isEmpty())
    {
        showStatusMessage("Error: No preferences namespace configured", true);
        return;
    }

    preferences.begin(prefsNamespace.c_str(), false); // Read-write

    for (const auto &field : fields)
    {
        if (field.inputObj)
        {
            String value = String(lv_textarea_get_text(field.inputObj));
            preferences.putString(field.id.c_str(), value);
            Serial.printf("SettingsForm: Saved %s = %s\n", field.id.c_str(), value.c_str());
        }
    }

    preferences.end();

    if (onSave)
    {
        onSave(true, "Settings saved successfully!");
    }
    else
    {
        showStatusMessage("Settings saved successfully!");
    }
}

String SettingsForm::getFieldValue(const String &fieldId) const
{
    for (const auto &field : fields)
    {
        if (field.id == fieldId && field.inputObj)
        {
            return String(lv_textarea_get_text(field.inputObj));
        }
    }
    return "";
}

void SettingsForm::setFieldValue(const String &fieldId, const String &value)
{
    for (auto &field : fields)
    {
        if (field.id == fieldId && field.inputObj)
        {
            lv_textarea_set_text(field.inputObj, value.c_str());
            break;
        }
    }
}

bool SettingsForm::validateAllFields()
{
    for (const auto &field : fields)
    {
        String errorMessage;
        if (!validateField(field, errorMessage))
        {
            showStatusMessage(errorMessage, true);
            return false;
        }
    }
    return true;
}

bool SettingsForm::validateField(const FormField &field, String &errorMessage)
{
    if (!field.inputObj)
    {
        errorMessage = "Field " + field.label + " is not properly initialized";
        return false;
    }

    String value = String(lv_textarea_get_text(field.inputObj));

    // Check required fields
    if (field.required && value.length() == 0)
    {
        errorMessage = "Error: " + field.label + " cannot be empty";
        return false;
    }

    // Type-specific validation
    if (field.type == FIELD_NUMBER && value.length() > 0)
    {
        int numValue = value.toInt();
        if (numValue == 0 && value != "0")
        {
            errorMessage = "Error: " + field.label + " must be a valid number";
            return false;
        }
    }

    // Custom validation callback
    if (onFieldValidation)
    {
        return onFieldValidation(field.id, value, errorMessage);
    }

    return true;
}

void SettingsForm::showStatusMessage(const String &message, bool isError)
{
    if (statusLabel)
    {
        lv_label_set_text(statusLabel, message.c_str());

        if (isError)
        {
            lv_obj_set_style_text_color(statusLabel, lv_color_hex(0xFF4444), 0);
        }
        else
        {
            lv_obj_set_style_text_color(statusLabel, lv_color_hex(0x00AA44), 0);
        }
    }
}

void SettingsForm::clearStatusMessage()
{
    if (statusLabel)
    {
        lv_label_set_text(statusLabel, "");
    }
}

void SettingsForm::showKeyboard(lv_obj_t *textArea)
{
    if (!keyboardManager || !textArea)
    {
        return;
    }

    activeTextArea = textArea;
    keyboardVisible = true;

    // Find the form container for keyboard attachment
    lv_obj_t *parent = formContainer;
    while (parent && lv_obj_get_parent(parent) != nullptr)
    {
        parent = lv_obj_get_parent(parent);
    }

    if (parent)
    {
        keyboardManager->attachToTextArea(parent, textArea);
        keyboardManager->show();
    }
}

void SettingsForm::hideKeyboard()
{
    if (keyboardManager && keyboardVisible)
    {
        keyboardManager->hide();
        keyboardVisible = false;
        activeTextArea = nullptr;
    }
}

// Event handlers
void SettingsForm::onFieldClicked(lv_event_t *e)
{
    SettingsForm *form = (SettingsForm *)lv_event_get_user_data(e);
    lv_obj_t *textArea = (lv_obj_t *)lv_event_get_target(e);

    if (form && textArea)
    {
        form->showKeyboard(textArea);
    }
}

void SettingsForm::onSaveButtonClicked(lv_event_t *e)
{
    SettingsForm *form = (SettingsForm *)lv_event_get_user_data(e);
    if (form)
    {
        form->hideKeyboard();
        form->saveValues();
    }
}