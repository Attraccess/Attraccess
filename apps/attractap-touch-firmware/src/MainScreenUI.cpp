#include "MainScreenUI.h"
#include <Arduino.h>
#include <lvgl.h>
#include "nfc_icon.c"
#include "AttraccessService.h" // Add this include
#include <ArduinoJson.h>       // For JsonDocument
#include "api_icon.c"          // Add this include for the API icon
#include <vector>

// Define the static members
String MainScreenUI::selectItemOptions[50];
MainScreenUI::SelectItemResultCallback MainScreenUI::selectItemResultCallback = nullptr;

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

    // Set icon color based on status
    if (authenticated)
    {
        // lv_obj_set_style_img_recolor_opa(attraccessStatusIcon, LV_OPA_COVER, 0);
        lv_obj_set_style_img_recolor(attraccessStatusIcon, lv_color_hex(0x00FF00), 0);
        Serial.printf("MainScreenUI: Attraccess status updated - Authenticated (%s)\n", status.c_str());
    }
    else if (connected)
    {
        // lv_obj_set_style_img_recolor_opa(attraccessStatusIcon, LV_OPA_COVER, 0);
        lv_obj_set_style_img_recolor(attraccessStatusIcon, lv_color_hex(0xFFFF00), 0);
        Serial.printf("MainScreenUI: Attraccess status updated - Connected but not authenticated (%s)\n", status.c_str());
    }
    else
    {
        // lv_obj_set_style_img_recolor_opa(attraccessStatusIcon, LV_OPA_COVER, 0);
        lv_obj_set_style_img_recolor(attraccessStatusIcon, lv_color_hex(0xFF0000), 0);
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

    // Attraccess status icon (next to WiFi icon) - now an image
    attraccessStatusIcon = lv_img_create(statusBar);
    lv_img_set_src(attraccessStatusIcon, &api_icon);
    lv_obj_align(attraccessStatusIcon, LV_ALIGN_RIGHT_MID, -20, 0);
    // Default color (red, disconnected)
    lv_obj_set_style_img_recolor_opa(attraccessStatusIcon, LV_OPA_COVER, 0);
    lv_obj_set_style_img_recolor(attraccessStatusIcon, lv_color_hex(0xFF0000), 0);
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

    // Sub-label for sub-message (smaller font)
    mainContentSubLabel = lv_label_create(mainContentContainer);
    lv_obj_set_width(mainContentSubLabel, 200);
    lv_obj_set_style_text_font(mainContentSubLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(mainContentSubLabel, lv_color_hex(0xAAAAAA), 0);
    lv_obj_set_style_text_align(mainContentSubLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(mainContentSubLabel, "");
    lv_obj_align(mainContentSubLabel, LV_ALIGN_TOP_MID, 0, 130);
    lv_label_set_long_mode(mainContentSubLabel, LV_LABEL_LONG_WRAP);

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

    // Firmware version label
    lv_obj_t *versionLabel = lv_label_create(mainContentContainer);
    lv_label_set_text(versionLabel, ("v" + String(FIRMWARE_VERSION)).c_str());
    lv_obj_set_style_text_color(versionLabel, lv_color_hex(0x666666), 0);
    lv_obj_set_style_text_font(versionLabel, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_align(versionLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(versionLabel, LV_ALIGN_BOTTOM_MID, 0, -30);

    // Subtle hint label for user guidance
    lv_obj_t *hintLabel = lv_label_create(mainContentContainer);
    lv_label_set_text(hintLabel, "\u2190 Swipe to access settings \u2192");
    lv_obj_set_style_text_color(hintLabel, lv_color_hex(0x444444), 0);
    lv_obj_set_style_text_font(hintLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_align(hintLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(hintLabel, LV_ALIGN_BOTTOM_MID, 0, -10);

    clearMainContent();
}

void MainScreenUI::setMainContent(const MainContent &content)
{
    Serial.printf("[DEBUG] MainScreenUI::setMainContent type=%d, message=%s, duration=%lu\n", (int)content.type, content.message.c_str(), (unsigned long)content.durationMs);
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
    Serial.println("[DEBUG] MainScreenUI::updateMainContent");

    // Ensure UI elements exist before updating
    restoreMainContentUI();

    // Hide all by default
    if (!mainContentIcon)
    {
        Serial.println("[ERROR] mainContentIcon is null!");
    }
    else
    {
        lv_obj_add_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
    }
    if (!mainContentLabel)
    {
        Serial.println("[ERROR] mainContentLabel is null!");
    }
    else
    {
        lv_label_set_text(mainContentLabel, "");
    }
    if (!mainContentSubLabel)
    {
        Serial.println("[ERROR] mainContentSubLabel is null!");
    }
    else
    {
        lv_label_set_text(mainContentSubLabel, ""); // Clear sub-label
    }

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
    else
    {
        Serial.println("[ERROR] cancelButton is null!");
    }

    switch (currentContent.type)
    {
    case CONTENT_NONE:
        Serial.println("[DEBUG] CONTENT_NONE: No UI update");
        // Show nothing
        break;
    case CONTENT_ERROR:
        Serial.printf("[DEBUG] CONTENT_ERROR: mainContentLabel=%p, message='%s'\n", mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_label_set_text(mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(currentContent.textColor), 0);
        Serial.printf("[DEBUG] mainContentSubLabel=%p, subMessage='%s'\n", mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_label_set_text(mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_obj_set_style_text_color(mainContentSubLabel, lv_color_hex(currentContent.subTextColor), 0);
        break;
    case CONTENT_SUCCESS:
        Serial.printf("[DEBUG] CONTENT_SUCCESS: mainContentLabel=%p, message='%s'\n", mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_label_set_text(mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(currentContent.textColor), 0);
        Serial.printf("[DEBUG] mainContentSubLabel=%p, subMessage='%s'\n", mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_label_set_text(mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_obj_set_style_text_color(mainContentSubLabel, lv_color_hex(currentContent.subTextColor), 0);
        break;
    case CONTENT_TEXT:
        Serial.printf("[DEBUG] CONTENT_TEXT: mainContentLabel=%p, message='%s'\n", mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_label_set_text(mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
            lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(currentContent.textColor), 0);
        Serial.printf("[DEBUG] mainContentSubLabel=%p, subMessage='%s'\n", mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_label_set_text(mainContentSubLabel, currentContent.subMessage.c_str());
        if (mainContentSubLabel)
            lv_obj_set_style_text_color(mainContentSubLabel, lv_color_hex(currentContent.subTextColor), 0);
        break;
    case CONTENT_CARD_CHECKING:
        Serial.printf("[DEBUG] CONTENT_CARD_CHECKING: mainContentLabel=%p, message='%s'\n", mainContentLabel, currentContent.message.c_str());
        if (mainContentLabel)
        {
            lv_label_set_text(mainContentLabel, currentContent.message.c_str());
            lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(currentContent.textColor), 0);
        }
        if (mainContentIcon)
            lv_obj_clear_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
        break;
    }
}

void MainScreenUI::restoreMainContentUI()
{
    // Recreate the main content UI elements if they were destroyed
    if (!mainContentLabel)
    {
        mainContentLabel = lv_label_create(mainContentContainer);
        lv_obj_set_width(mainContentLabel, 200);
        lv_obj_set_style_text_font(mainContentLabel, &lv_font_montserrat_16, 0);
        lv_obj_set_style_text_color(mainContentLabel, lv_color_hex(0xFFFFFF), 0);
        lv_obj_set_style_text_align(mainContentLabel, LV_TEXT_ALIGN_CENTER, 0);
        lv_label_set_text(mainContentLabel, "");
        lv_obj_align(mainContentLabel, LV_ALIGN_TOP_MID, 0, 100);
        lv_label_set_long_mode(mainContentLabel, LV_LABEL_LONG_WRAP);
    }

    if (!mainContentSubLabel)
    {
        mainContentSubLabel = lv_label_create(mainContentContainer);
        lv_obj_set_width(mainContentSubLabel, 200);
        lv_obj_set_style_text_font(mainContentSubLabel, &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_color(mainContentSubLabel, lv_color_hex(0xAAAAAA), 0);
        lv_obj_set_style_text_align(mainContentSubLabel, LV_TEXT_ALIGN_CENTER, 0);
        lv_label_set_text(mainContentSubLabel, "");
        lv_obj_align(mainContentSubLabel, LV_ALIGN_TOP_MID, 0, 130);
        lv_label_set_long_mode(mainContentSubLabel, LV_LABEL_LONG_WRAP);
    }

    if (!mainContentIcon)
    {
        mainContentIcon = lv_img_create(mainContentContainer);
        lv_img_set_src(mainContentIcon, &nfc_icon);
        lv_obj_align(mainContentIcon, LV_ALIGN_TOP_MID, 0, 20);
        lv_obj_add_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
    }

    if (!cancelButton)
    {
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
    }
}

void MainScreenUI::cleanupSelectDialog()
{
    Serial.println("MainScreenUI: Cleaning up select dialog UI");

    // Remove all child objects from mainContentContainer (this removes the select dialog)
    lv_obj_clean(mainContentContainer);

    // Reset the UI element pointers since they were deleted
    mainContentLabel = nullptr;
    mainContentSubLabel = nullptr;
    mainContentIcon = nullptr;
    cancelButton = nullptr;

    // Restore the main content UI
    restoreMainContentUI();

    // Clear the select item callback
    selectItemResultCallback = nullptr;

    Serial.println("MainScreenUI: Select dialog cleanup complete");
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

void MainScreenUI::onSelectItemButtonClicked(lv_event_t *e)
{
    Serial.println("MainScreenUI: Select item button clicked");
    uint64_t buttonIndex = (uint64_t)lv_event_get_user_data(e);
    if (buttonIndex == 0)
    {
        Serial.printf("Cannot process select item button click: buttonIndex is 0");
        return;
    }

    buttonIndex--;

    Serial.println("buttonIndex:");
    Serial.println(buttonIndex);

    if (buttonIndex >= 50)
    {
        Serial.printf("Cannot process select item button click: buttonIndex is out of range");
        return;
    }

    // Check if the option at this index is valid (not empty)
    if (MainScreenUI::selectItemOptions[buttonIndex].length() == 0)
    {
        Serial.printf("Cannot process select item button click: option at index %llu is empty", buttonIndex);
        return;
    }

    Serial.printf("selectItemOptions[%llu]: %s\n", buttonIndex, MainScreenUI::selectItemOptions[buttonIndex].c_str());
    if (selectItemResultCallback)
    {
        // Store the callback and selected ID before cleanup
        SelectItemResultCallback callback = selectItemResultCallback;
        String selectedId = MainScreenUI::selectItemOptions[buttonIndex];

        // Clear the callback first to prevent recursive calls
        selectItemResultCallback = nullptr;

        // Then call the callback (cleanup will be handled by the callback)
        callback(selectedId);
    }
}

void MainScreenUI::showSelectItemDialog(const String &label, const ArduinoJson::JsonArray &options, SelectItemResultCallback cb)
{
    selectItemResultCallback = cb;

    // Clear previous options array to prevent stale data
    for (int i = 0; i < 50; i++)
    {
        selectItemOptions[i] = "";
    }

    // Remove any previous selection UI (if any)
    if (selectItemDialog)
    {
        lv_obj_del(selectItemDialog);
        selectItemDialog = nullptr;
    }

    // Clear main content area but preserve the basic UI structure
    // Hide existing elements instead of cleaning the container
    if (mainContentLabel)
        lv_obj_add_flag(mainContentLabel, LV_OBJ_FLAG_HIDDEN);
    if (mainContentSubLabel)
        lv_obj_add_flag(mainContentSubLabel, LV_OBJ_FLAG_HIDDEN);
    if (mainContentIcon)
        lv_obj_add_flag(mainContentIcon, LV_OBJ_FLAG_HIDDEN);
    if (cancelButton)
        lv_obj_add_flag(cancelButton, LV_OBJ_FLAG_HIDDEN);

    // Label at the top
    lv_obj_t *titleLabel = lv_label_create(mainContentContainer);
    lv_label_set_text(titleLabel, label.c_str());
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(titleLabel, LV_ALIGN_TOP_MID, 0, 10);

    // Container for buttons (vertical flex)
    lv_obj_t *buttonContainer = lv_obj_create(mainContentContainer);
    lv_obj_set_size(buttonContainer, 200, LV_SIZE_CONTENT);
    lv_obj_align(buttonContainer, LV_ALIGN_TOP_MID, 0, 50);
    lv_obj_set_style_bg_opa(buttonContainer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(buttonContainer, 0, 0);
    lv_obj_set_style_pad_all(buttonContainer, 0, 0);
    lv_obj_set_flex_flow(buttonContainer, LV_FLEX_FLOW_COLUMN);
    lv_obj_clear_flag(buttonContainer, LV_OBJ_FLAG_SCROLLABLE);

    // For each option, create a button
    uint64_t i = 0;
    for (JsonObject option : options)
    {
        String optId = option["id"].as<String>();
        String optLabel = option["label"].as<String>();
        lv_obj_t *btn = lv_btn_create(buttonContainer);
        lv_obj_set_size(btn, 200, 36);
        lv_obj_set_style_bg_color(btn, lv_color_hex(0x2196F3), 0);
        lv_obj_set_style_bg_color(btn, lv_color_hex(0x1976D2), LV_STATE_PRESSED);
        lv_obj_set_style_radius(btn, 6, 0);

        // Create handler and store it as user data
        Serial.println("Adding event callback to button with optId:");
        Serial.println(optId.c_str());
        lv_obj_add_event_cb(btn, onSelectItemButtonClicked, LV_EVENT_CLICKED, (void *)(i + 1));
        MainScreenUI::selectItemOptions[i] = optId;
        i++;

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, optLabel.c_str());
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFFFFFF), 0);
        lv_obj_center(lbl);
    }
}