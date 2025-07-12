#ifndef SETTINGS_FORM_H
#define SETTINGS_FORM_H

#include <Arduino.h>
#include <lvgl.h>
#include <functional>
#include <vector>
#include <Preferences.h>

// Forward declaration
class KeyboardManager;

class SettingsForm
{
public:
    // Field types
    enum FieldType
    {
        FIELD_TEXT,
        FIELD_NUMBER,
        FIELD_PASSWORD
    };

    // Field definition structure
    struct FormField
    {
        String id;
        String label;
        FieldType type;
        String defaultValue;
        bool required;
        int maxLength;
        String validation; // Future: regex or validation rules

        // UI elements (populated when form is created)
        lv_obj_t *labelObj;
        lv_obj_t *inputObj;

        FormField(const String &fieldId, const String &fieldLabel,
                  FieldType fieldType = FIELD_TEXT, const String &fieldDefault = "",
                  bool fieldRequired = false, int fieldMaxLength = 100)
            : id(fieldId), label(fieldLabel),
              type(fieldType), defaultValue(fieldDefault), required(fieldRequired),
              maxLength(fieldMaxLength), labelObj(nullptr), inputObj(nullptr) {}
    };

    // Callback function types
    typedef std::function<void(const String &fieldId, const String &value)> FieldValueCallback;
    typedef std::function<bool(const String &fieldId, const String &value, String &errorMessage)> FieldValidationCallback;
    typedef std::function<void(bool success, const String &message)> SaveCallback;

    SettingsForm();
    ~SettingsForm();

    // Configuration
    void setPreferencesNamespace(const String &ns);
    void setKeyboardManager(KeyboardManager *keyboardMgr);

    // Field management
    void addField(const FormField &field);
    void clearFields();

    // Validation and callbacks
    void setFieldValidationCallback(FieldValidationCallback callback);
    void setSaveCallback(SaveCallback callback);

    // Create the form UI and return the container
    lv_obj_t *create(lv_obj_t *parent);

    // Data management
    void loadValues();
    void saveValues();
    String getFieldValue(const String &fieldId) const;
    void setFieldValue(const String &fieldId, const String &value);

    // UI updates
    void showStatusMessage(const String &message, bool isError = false);
    void clearStatusMessage();

    // Keyboard management
    void showKeyboard(lv_obj_t *textArea);
    void hideKeyboard();

private:
    // UI components
    lv_obj_t *formContainer;
    lv_obj_t *saveButton;
    lv_obj_t *statusLabel;

    // Data
    std::vector<FormField> fields;
    Preferences preferences;
    String prefsNamespace;

    // Dependencies
    KeyboardManager *keyboardManager;

    // State
    bool keyboardVisible;
    lv_obj_t *activeTextArea;

    // Callbacks
    FieldValidationCallback onFieldValidation;
    SaveCallback onSave;

    // Private methods
    void createFormField(FormField &field, lv_obj_t *parent, int &yOffset);
    bool validateAllFields();
    bool validateField(const FormField &field, String &errorMessage);

    // Event handlers
    static void onFieldClicked(lv_event_t *e);
    static void onSaveButtonClicked(lv_event_t *e);
};

#endif // SETTINGS_FORM_H