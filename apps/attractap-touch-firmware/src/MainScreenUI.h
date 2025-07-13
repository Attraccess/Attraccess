#ifndef MAIN_SCREEN_UI_H
#define MAIN_SCREEN_UI_H

#include <Arduino.h>
#include <lvgl.h>
#include "ScreenManager.h"

class MainScreenUI
{
public:
    // Callback types for user interactions
    typedef void (*SettingsButtonCallback)();

    // Types of main content that can be shown
    enum MainContentType
    {
        CONTENT_NONE,
        CONTENT_ERROR,
        CONTENT_CARD_CHECKING
    };

    struct MainContent
    {
        MainContentType type;
        String message;
        String subMessage;     // New: sub-message for secondary label
        uint32_t durationMs;   // Only used for error
        uint32_t textColor;    // New: text color for message (hex RGB)
        uint32_t subTextColor; // New: text color for sub-message
        bool showCancelButton; // Show cancel button (for enroll/reset NFC card)
        MainContent() : type(CONTENT_NONE), message(""), subMessage(""), durationMs(0), textColor(0xFFFFFF), subTextColor(0xAAAAAA), showCancelButton(false) {}
    };

    MainScreenUI(ScreenManager *screenManager);
    ~MainScreenUI();

    void init();
    void updateWiFiStatus(bool connected, const String &ssid = "", const String &ip = "");
    void updateAttraccessStatus(bool connected, bool authenticated, const String &status = "", const String &readerName = "");
    void setSettingsButtonCallback(SettingsButtonCallback callback);

    // New: Set the main content area (replaces dialogs/popups)
    void setMainContent(const MainContent &content);

    // UI state
    bool isCreated() const { return mainScreen != nullptr; }

private:
    ScreenManager *screenManager;

    // LVGL objects
    lv_obj_t *mainScreen;
    lv_obj_t *statusBar;
    lv_obj_t *appNameLabel;
    lv_obj_t *wifiStatusIcon;
    lv_obj_t *attraccessStatusIcon;

    // Main content area
    lv_obj_t *mainContentContainer;
    lv_obj_t *mainContentLabel;
    lv_obj_t *mainContentSubLabel; // New: sub-label for secondary message
    lv_obj_t *mainContentIcon;     // For card checking
    lv_obj_t *cancelButton;        // Cancel button for enroll/reset NFC card

    // State
    MainContent currentContent;
    lv_timer_t *autoClearTimer;

    // Callbacks
    SettingsButtonCallback settingsCallback;

    // UI creation
    void createUI();
    void createStatusBar();
    void createContent();
    void updateMainContent();
    void clearMainContent();

    // Event handlers
    static void onSettingsButtonClicked(lv_event_t *e);
    static void onSwipeGesture(lv_event_t *e);
    static void onAutoClearTimer(lv_timer_t *timer);
    static void onCancelButtonClicked(lv_event_t *e);
};

#endif // MAIN_SCREEN_UI_H