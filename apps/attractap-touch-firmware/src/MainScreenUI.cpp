#include "MainScreenUI.h"
#include <Arduino.h>
#include <lvgl.h>
#include "nfc_icon.c"
#include "AttraccessService.h" // Add this include
#include <ArduinoJson.h>       // For JsonDocument

MainScreenUI::MainScreenUI(ScreenManager *screenManager)
    : screenManager(screenManager), mainScreen(nullptr), statusBar(nullptr),
      appNameLabel(nullptr), wifiStatusIcon(nullptr), attraccessStatusIcon(nullptr),
      mainContentContainer(nullptr), mainContentLabel(nullptr), mainContentIcon(nullptr),
      autoClearTimer(nullptr), settingsCallback(nullptr)
{
}

MainScreenUI::~MainScreenUI()
{
    if (mainScreen)
    {
        screenManager->unregisterScreen(ScreenManager::SCREEN_MAIN);
        lv_obj_del(mainScreen);
        mainScreen = nullptr;
    }
    if (autoClearTimer)
    {
        lv_timer_del(autoClearTimer);
        autoClearTimer = nullptr;
    }
}

void MainScreenUI::init()
{
    if (isCreated())
    {
        Serial.println("MainScreenUI: Already initialized");
        return;
    }

    Serial.println("MainScreenUI: Initializing...");
    createUI();
    screenManager->registerScreen(ScreenManager::SCREEN_MAIN, mainScreen);
    Serial.println("MainScreenUI: Ready");
}

void MainScreenUI::updateWiFiStatus(bool connected, const String &ssid, const String &ip)
{
    if (!wifiStatusIcon)
        return;

    if (connected)
    {
        lv_label_set_text(wifiStatusIcon, LV_SYMBOL_WIFI);
        lv_obj_set_style_text_color(wifiStatusIcon, lv_color_hex(0x00FF00), 0);
        Serial.printf("MainScreenUI: WiFi status updated - Connected to %s (%s)\n",
                      ssid.c_str(), ip.c_str());
    }
    else
    {
        lv_label_set_text(wifiStatusIcon, LV_SYMBOL_WIFI);
        lv_obj_set_style_text_color(wifiStatusIcon, lv_color_hex(0xFF0000), 0);
        Serial.println("MainScreenUI: WiFi status updated - Disconnected");
    }
}

void MainScreenUI::updateAttraccessStatus(bool connected, bool authenticated, const String &status, const String &readerName)
{
    if (!attraccessStatusIcon)
        return;

    // Update app name label with reader name or fallback to "Attraccess"
    if (appNameLabel)
    {
        String displayName = readerName.isEmpty() ? "Attraccess" : readerName;
        lv_label_set_text(appNameLabel, displayName.c_str());
        Serial.printf("MainScreenUI: App name updated to: %s\n", displayName.c_str());
    }

    if (authenticated)
    {
        lv_label_set_text(attraccessStatusIcon, LV_SYMBOL_CALL);
        lv_obj_set_style_text_color(attraccessStatusIcon, lv_color_hex(0x00FF00), 0);
        Serial.printf("MainScreenUI: Attraccess status updated - Authenticated (%s)\n", status.c_str());
    }
    else if (connected)
    {
        lv_label_set_text(attraccessStatusIcon, LV_SYMBOL_CALL);
        lv_obj_set_style_text_color(attraccessStatusIcon, lv_color_hex(0xFFFF00), 0);
        Serial.printf("MainScreenUI: Attraccess status updated - Connected but not authenticated (%s)\n", status.c_str());
    }
    else
    {
        lv_label_set_text(attraccessStatusIcon, LV_SYMBOL_CALL);
        lv_obj_set_style_text_color(attraccessStatusIcon, lv_color_hex(0xFF0000), 0);
        Serial.printf("MainScreenUI: Attraccess status updated - Disconnected (%s)\n", status.c_str());
    }
}

void MainScreenUI::setSettingsButtonCallback(SettingsButtonCallback callback)
{
    settingsCallback = callback;
}

void MainScreenUI::createUI()
{
    if (mainScreen)
    {
        Serial.println("MainScreenUI: Screen already created");
        return;
    }

    Serial.println("MainScreenUI: Creating main screen UI...");

    // Create main screen
    mainScreen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(mainScreen, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(mainScreen, LV_OPA_COVER, 0);
    lv_obj_clear_flag(mainScreen, LV_OBJ_FLAG_HIDDEN);

    Serial.printf("MainScreenUI: Main screen created at %p\n", mainScreen);

    createStatusBar();
    createContent();

    // Add swipe gesture support to the main screen
    lv_obj_add_event_cb(mainScreen, onSwipeGesture, LV_EVENT_GESTURE, this);

    Serial.println("MainScreenUI: UI creation completed");
}

void MainScreenUI::createStatusBar()
{
    // Status bar
    statusBar = lv_obj_create(mainScreen);
    lv_obj_set_size(statusBar, 240, 25);
    lv_obj_align(statusBar, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(statusBar, lv_color_hex(0x1a1a1a), 0);
    lv_obj_set_style_border_width(statusBar, 0, 0);
    lv_obj_set_style_radius(statusBar, 0, 0);
    lv_obj_set_style_pad_all(statusBar, 5, 0);

    // App name label (top left)
    appNameLabel = lv_label_create(statusBar);
    lv_label_set_text(appNameLabel, "Attraccess");
    lv_obj_set_style_text_color(appNameLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(appNameLabel, &lv_font_montserrat_14, 0);
    lv_obj_align(appNameLabel, LV_ALIGN_LEFT_MID, 0, 0);

    // WiFi status icon (top right)
    wifiStatusIcon = lv_label_create(statusBar);
    lv_label_set_text(wifiStatusIcon, LV_SYMBOL_WIFI);
    lv_obj_set_style_text_color(wifiStatusIcon, lv_color_hex(0xFF0000), 0);
    lv_obj_set_style_text_font(wifiStatusIcon, &lv_font_montserrat_14, 0);
    lv_obj_align(wifiStatusIcon, LV_ALIGN_RIGHT_MID, 0, 0);

    // Attraccess status icon (next to WiFi icon)
    attraccessStatusIcon = lv_label_create(statusBar);
    lv_label_set_text(attraccessStatusIcon, LV_SYMBOL_CALL);
    lv_obj_set_style_text_color(attraccessStatusIcon, lv_color_hex(0xFF0000), 0);
    lv_obj_set_style_text_font(attraccessStatusIcon, &lv_font_montserrat_14, 0);
    lv_obj_align(attraccessStatusIcon, LV_ALIGN_RIGHT_MID, -20, 0);
}

void MainScreenUI::createContent()
{
    // Main content container (fills area below status bar)
    mainContentContainer = lv_obj_create(mainScreen);
    lv_obj_set_size(mainContentContainer, 240, 295); // 320 - 25 status bar
    lv_obj_align(mainContentContainer, LV_ALIGN_TOP_MID, 0, 25);
    lv_obj_set_style_bg_color(mainContentContainer, lv_color_hex(0x000000), 0);
    lv_obj_set_style_border_width(mainContentContainer, 0, 0);
    lv_obj_set_style_pad_all(mainContentContainer, 0, 0);
    lv_obj_clear_flag(mainContentContainer, LV_OBJ_FLAG_SCROLLABLE);

    // Icon for card checking (hidden by default)
    mainContentIcon = lv_img_create(mainContentContainer);
    lv_img_set_src(mainContentIcon, &nfc_icon);
    lv_obj_align(mainContentIcon, LV_ALIGN_TOP_MID, 0, 20);
    lv_obj_add_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);

    // Main content label
    mainContentLabel = lv_label_create(mainContentContainer);
    lv_obj_set_width(mainContentLabel, 200);
    lv_obj_set_style_text_font(mainContentLabel, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_align(mainContentLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(mainContentLabel, "");
    lv_obj_align(mainContentLabel, LV_ALIGN_TOP_MID, 0, 100);
    lv_label_set_long_mode(mainContentLabel, LV_LABEL_LONG_WRAP);

    // Cancel button (hidden by default)
    cancelButton = lv_btn_create(mainContentContainer);
    lv_obj_set_size(cancelButton, 120, 40);
    lv_obj_align(cancelButton, LV_ALIGN_BOTTOM_MID, 0, -50);
    lv_obj_set_style_bg_color(cancelButton, lv_color_hex(0xF44336), 0); // Red
    lv_obj_add_flag(cancelButton, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *label = lv_label_create(cancelButton);
    lv_label_set_text(label, "Cancel");
    lv_obj_center(label);
    // Attach event handler for cancel button
    lv_obj_add_event_cb(cancelButton, onCancelButtonClicked, LV_EVENT_CLICKED, this);

    // Subtle hint label for user guidance
    lv_obj_t *hintLabel = lv_label_create(mainContentContainer);
    lv_label_set_text(hintLabel, "← Swipe to access settings →");
    lv_obj_set_style_text_color(hintLabel, lv_color_hex(0x444444), 0);
    lv_obj_set_style_text_font(hintLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_align(hintLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(hintLabel, LV_ALIGN_BOTTOM_MID, 0, -10);

    clearMainContent();
}

void MainScreenUI::setMainContent(const MainContent &content)
{
    // Cancel any previous auto-clear timer
    if (autoClearTimer)
    {
        lv_timer_del(autoClearTimer);
        autoClearTimer = nullptr;
    }
    currentContent = content;
    updateMainContent();
    // If error with duration, auto-clear after duration
    if (content.type == CONTENT_ERROR && content.durationMs > 0)
    {
        autoClearTimer = lv_timer_create(onAutoClearTimer, content.durationMs, this);
        lv_timer_set_repeat_count(autoClearTimer, 1);
    }
}

void MainScreenUI::updateMainContent()
{
    // Hide all by default
    lv_obj_add_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_text(mainContentLabel, "");

    if (cancelButton)
    {
        if (currentContent.showCancelButton)
        {
            lv_obj_clear_flag(cancelButton, LV_OBJ_FLAG_HIDDEN);
        }
        else
        {
            lv_obj_add_flag(cancelButton, LV_OBJ_FLAG_HIDDEN);
        }
    }

    switch (currentContent.type)
    {
    case CONTENT_NONE:
        // Show nothing
        break;
    case CONTENT_ERROR:
        lv_label_set_text(mainContentLabel, currentContent.message.c_str());
        lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(0xFF4444), 0);
        break;
    case CONTENT_CARD_CHECKING:
        lv_label_set_text(mainContentLabel, currentContent.message.c_str());
        lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(currentContent.textColor), 0);
        lv_obj_clear_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
        break;
    }
}

void MainScreenUI::clearMainContent()
{
    currentContent = MainContent();
    updateMainContent();
}

void MainScreenUI::onAutoClearTimer(lv_timer_t *timer)
{
    MainScreenUI *self = static_cast<MainScreenUI *>(timer->user_data);
    if (self)
    {
        self->clearMainContent();
    }
}

void MainScreenUI::onSettingsButtonClicked(lv_event_t *e)
{
    MainScreenUI *ui = (MainScreenUI *)lv_event_get_user_data(e);
    if (ui && ui->settingsCallback)
    {
        Serial.println("MainScreenUI: Settings button clicked");
        ui->settingsCallback();
    }
}

void MainScreenUI::onSwipeGesture(lv_event_t *e)
{
    MainScreenUI *ui = (MainScreenUI *)lv_event_get_user_data(e);
    if (ui && ui->settingsCallback)
    {
        lv_dir_t dir = lv_indev_get_gesture_dir(lv_indev_get_act());

        // Trigger settings on left or right swipe
        if (dir == LV_DIR_LEFT || dir == LV_DIR_RIGHT)
        {
            Serial.printf("MainScreenUI: Swipe gesture detected (direction: %s)\n",
                          dir == LV_DIR_LEFT ? "LEFT" : "RIGHT");
            ui->settingsCallback();
        }
    }
}

void MainScreenUI::onCancelButtonClicked(lv_event_t *e)
{
    MainScreenUI *ui = (MainScreenUI *)lv_event_get_user_data(e);
    if (ui)
    {
        Serial.println("MainScreenUI: Cancel button clicked, sending CANCEL event to server");
        // Prepare empty payload
        StaticJsonDocument<64> doc;
        JsonObject payload = doc.to<JsonObject>();
        extern AttraccessService attraccessService; // Use the global instance
        attraccessService.sendMessage("CANCEL", payload);
    }
}