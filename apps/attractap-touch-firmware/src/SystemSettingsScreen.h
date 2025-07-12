#ifndef SYSTEM_SETTINGS_SCREEN_H
#define SYSTEM_SETTINGS_SCREEN_H

#include <Arduino.h>
#include <lvgl.h>
#include <Preferences.h>
#include "SettingsHeader.h"

class SystemSettingsScreen
{
public:
    // Callback function types
    typedef std::function<void()> BackToSettingsCallback;

    SystemSettingsScreen();
    ~SystemSettingsScreen();

    void begin();
    void show();
    void hide();
    void update();

    // Set callbacks
    void setBackToSettingsCallback(BackToSettingsCallback callback);

    // Check if the screen is currently visible
    bool isVisible() const;

private:
    // UI components
    lv_obj_t *screen;
    SettingsHeader *header;
    lv_obj_t *infoLabel;
    lv_obj_t *resetButton;

    // State
    bool visible;

    // Dependencies
    Preferences preferences;

    // Callbacks
    BackToSettingsCallback onBackToSettings;

    // Private methods
    void createUI();
    void updateSystemInfo();
    void performFactoryReset();

    // Event handlers
    static void onResetButtonClicked(lv_event_t *e);
};

#endif // SYSTEM_SETTINGS_SCREEN_H