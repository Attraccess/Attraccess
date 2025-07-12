#ifndef SETTINGS_LIST_SCREEN_H
#define SETTINGS_LIST_SCREEN_H

#include <Arduino.h>
#include <lvgl.h>
#include "SettingsHeader.h"

// Forward declarations
struct SettingsCategory;

class SettingsListScreen
{
public:
    // Callback function types
    typedef std::function<void(const String &categoryId)> CategorySelectedCallback;
    typedef std::function<void()> BackToMainCallback;

    SettingsListScreen();
    ~SettingsListScreen();

    void begin();
    void show();
    void hide();
    void update();

    // Set callbacks
    void setCategorySelectedCallback(CategorySelectedCallback callback);
    void setBackToMainCallback(BackToMainCallback callback);

    // Check if the screen is currently visible
    bool isVisible() const;

    // Category management
    void addCategory(const String &id, const String &title, const String &icon,
                     const String &subtitle = "", lv_color_t iconColor = lv_color_hex(0xFFFFFF));
    void clearCategories();

private:
    static const uint8_t MAX_CATEGORIES = 10;

    // UI components
    lv_obj_t *screen;
    SettingsHeader *header;
    lv_obj_t *settingsList;

    // State
    bool visible;

    // Callbacks
    CategorySelectedCallback onCategorySelected;
    BackToMainCallback onBackToMain;

    // Category data
    struct CategoryData
    {
        String id;
        String title;
        String icon;
        String subtitle;
        lv_color_t iconColor;
    };

    CategoryData categories[MAX_CATEGORIES];
    uint8_t categoryCount;

    // Private methods
    void createUI();
    void populateList();

    // Event handlers
    static void onSettingsListItemClicked(lv_event_t *e);
};

#endif // SETTINGS_LIST_SCREEN_H