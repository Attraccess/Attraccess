#ifndef ATTRACCESS_SETTINGS_SCREEN_H
#define ATTRACCESS_SETTINGS_SCREEN_H

#include <Arduino.h>
#include <lvgl.h>
#include <Preferences.h>
#include "KeyboardManager.h"
#include "SettingsHeader.h"
#include "SettingsForm.h"

class AttraccessSettingsScreen
{
public:
    // Callback function types
    typedef std::function<void()> BackToSettingsCallback;
    typedef std::function<void(const String &hostname, uint16_t port)> SettingsSavedCallback;

    AttraccessSettingsScreen();
    ~AttraccessSettingsScreen();

    void begin();
    void begin(KeyboardManager *keyboardMgr);
    void show();
    void hide();
    void update();

    // Set callbacks
    void setBackToSettingsCallback(BackToSettingsCallback callback);
    void setSettingsSavedCallback(SettingsSavedCallback callback);

    // Status display
    void updateConnectionStatus(const String &status, bool connected, bool authenticated);

    // Check if the screen is currently visible
    bool isVisible() const;

private:
    // UI components
    lv_obj_t *screen;
    SettingsHeader *header;
    SettingsForm *form;
    lv_obj_t *statusLabel;

    // State
    bool visible;

    // Dependencies
    KeyboardManager *keyboardManager;

    // Callbacks
    BackToSettingsCallback onBackToSettings;
    SettingsSavedCallback onSettingsSaved;

    // Private methods
    void createUI();
    void setupFormFields();
    void setupFormCallbacks();
    bool validatePortField(const String &fieldId, const String &value, String &errorMessage);

    // Event handlers (for form callbacks)
    void onFormSave(bool success, const String &message);
};

#endif // ATTRACCESS_SETTINGS_SCREEN_H