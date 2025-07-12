#ifndef SETTINGS_HEADER_H
#define SETTINGS_HEADER_H

#include <Arduino.h>
#include <lvgl.h>
#include <functional>

class SettingsHeader
{
public:
    // Callback function type for back button
    typedef std::function<void()> BackButtonCallback;

    SettingsHeader();
    ~SettingsHeader();

    // Create the header and return the container object
    lv_obj_t *create(lv_obj_t *parent, const String &title, BackButtonCallback backCallback);

    // Update the title text
    void setTitle(const String &title);

    // Get the header container (for positioning other elements)
    lv_obj_t *getContainer() const { return headerContainer; }

    // Get the height of the header (for layout calculations)
    static constexpr int getHeight() { return 50; }

private:
    // UI components
    lv_obj_t *headerContainer;
    lv_obj_t *backButton;
    lv_obj_t *titleLabel;

    // Callback
    BackButtonCallback onBackPressed;

    // Event handler
    static void onBackButtonClicked(lv_event_t *e);
};

#endif // SETTINGS_HEADER_H