#include "AttraccessSettingsScreen.h"

AttraccessSettingsScreen::AttraccessSettingsScreen()
    : screen(nullptr),
      header(nullptr),
      form(nullptr),
      statusLabel(nullptr),
      visible(false),
      keyboardManager(nullptr),
      onBackToSettings(nullptr),
      onSettingsSaved(nullptr)
{
}

AttraccessSettingsScreen::~AttraccessSettingsScreen()
{
    if (form)
    {
        delete form;
        form = nullptr;
    }

    if (header)
    {
        delete header;
        header = nullptr;
    }

    if (screen)
    {
        lv_obj_del(screen);
        screen = nullptr;
    }
}

void AttraccessSettingsScreen::begin()
{
    Serial.println("AttraccessSettingsScreen: Initializing...");

    createUI();

    Serial.println("AttraccessSettingsScreen: Initialization complete");
}

void AttraccessSettingsScreen::begin(KeyboardManager *keyboardMgr)
{
    keyboardManager = keyboardMgr;
    begin();
}

void AttraccessSettingsScreen::createUI()
{
    // Create main screen
    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x1E1E1E), 0);

    // Create header
    header = new SettingsHeader();
    header->create(screen, "Attraccess", [this]()
                   {
        if (onBackToSettings) {
            onBackToSettings();
        } });

    // Create form
    form = new SettingsForm();
    form->setPreferencesNamespace("attraccess");
    if (keyboardManager)
    {
        form->setKeyboardManager(keyboardManager);
    }

    // Add fields BEFORE creating UI
    setupFormFields();

    // Create the form UI
    form->create(screen);

    // Create status label positioned below the form instead of at bottom of screen
    statusLabel = lv_label_create(screen);
    lv_label_set_text(statusLabel, "Status: Disconnected");
    lv_obj_set_style_text_color(statusLabel, lv_color_hex(0xFF0000), 0);
    lv_obj_set_style_text_align(statusLabel, LV_TEXT_ALIGN_CENTER, 0);
    // Position it below the form content (header + 2 fields + save button + margin)
    // Header: 50px, Field1: 85px, Field2: 85px, Save button: 60px, Total: ~280px
    lv_obj_align(statusLabel, LV_ALIGN_TOP_MID, 0, 300);

    // Setup callbacks and load values
    setupFormCallbacks();
}

void AttraccessSettingsScreen::setupFormFields()
{
    if (!form)
    {
        Serial.println("AttraccessSettingsScreen: Error - form not created");
        return;
    }

    // Add form fields
    SettingsForm::FormField hostnameField("hostname", "Server Domain/IP",
                                          SettingsForm::FIELD_TEXT, "", true);
    form->addField(hostnameField);

    SettingsForm::FormField portField("port", "Server Port",
                                      SettingsForm::FIELD_NUMBER, "", true, 5);
    form->addField(portField);
}

void AttraccessSettingsScreen::setupFormCallbacks()
{
    if (!form)
    {
        Serial.println("AttraccessSettingsScreen: Error - form not created");
        return;
    }

    // Set validation callback for port validation
    form->setFieldValidationCallback([this](const String &fieldId, const String &value, String &errorMessage) -> bool
                                     { return validatePortField(fieldId, value, errorMessage); });

    // Set save callback
    form->setSaveCallback([this](bool success, const String &message)
                          { onFormSave(success, message); });

    // Load saved values
    form->loadValues();
}

void AttraccessSettingsScreen::show()
{
    if (screen)
    {
        lv_scr_load(screen);
        visible = true;
        Serial.println("AttraccessSettingsScreen: Attraccess settings screen shown");
    }
}

void AttraccessSettingsScreen::hide()
{
    visible = false;
    if (form)
    {
        form->hideKeyboard();
    }
}

void AttraccessSettingsScreen::update()
{
    // No periodic updates needed for Attraccess settings
}

bool AttraccessSettingsScreen::isVisible() const
{
    return visible;
}

void AttraccessSettingsScreen::setBackToSettingsCallback(BackToSettingsCallback callback)
{
    onBackToSettings = callback;
}

void AttraccessSettingsScreen::setSettingsSavedCallback(SettingsSavedCallback callback)
{
    onSettingsSaved = callback;
}

bool AttraccessSettingsScreen::validatePortField(const String &fieldId, const String &value, String &errorMessage)
{
    if (fieldId == "port" && !value.isEmpty())
    {
        int portNum = value.toInt();
        if (portNum < 1 || portNum > 65535)
        {
            errorMessage = "Error: Port must be between 1 and 65535";
            return false;
        }
    }
    return true;
}

void AttraccessSettingsScreen::onFormSave(bool success, const String &message)
{
    Serial.printf("AttraccessSettingsScreen: Form save result - success: %s, message: %s\n",
                  success ? "true" : "false", message.c_str());

    if (success)
    {
        String hostname = form->getFieldValue("hostname");
        String portStr = form->getFieldValue("port");
        uint16_t port = portStr.toInt();

        Serial.printf("AttraccessSettingsScreen: Settings saved - hostname: %s, port: %d\n",
                      hostname.c_str(), port);

        // Notify the callback about the settings change
        if (onSettingsSaved)
        {
            onSettingsSaved(hostname, port);
        }
    }
}

void AttraccessSettingsScreen::updateConnectionStatus(const String &status, bool connected, bool authenticated)
{
    if (!statusLabel)
        return;

    String displayText;
    if (authenticated)
    {
        displayText = "Status: Authenticated";
        lv_obj_set_style_text_color(statusLabel, lv_color_hex(0x00FF00), 0);
    }
    else if (connected)
    {
        displayText = "Status: Connected (Not Authenticated)";
        lv_obj_set_style_text_color(statusLabel, lv_color_hex(0xFFFF00), 0);
    }
    else
    {
        displayText = "Status: Disconnected";
        lv_obj_set_style_text_color(statusLabel, lv_color_hex(0xFF0000), 0);
    }

    lv_label_set_text(statusLabel, displayText.c_str());
}

// Event handlers are now handled by the SettingsHeader and SettingsForm components