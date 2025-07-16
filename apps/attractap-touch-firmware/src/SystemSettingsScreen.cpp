#include "SystemSettingsScreen.h"
#include "WiFiService.h"

SystemSettingsScreen::SystemSettingsScreen()
    : screen(nullptr),
      header(nullptr),
      infoLabel(nullptr),
      resetButton(nullptr),
      visible(false),
      onBackToSettings(nullptr)
{
}

SystemSettingsScreen::~SystemSettingsScreen()
{
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

void SystemSettingsScreen::begin()
{
    // UI will be created when first shown
}

void SystemSettingsScreen::show()
{
    if (!screen)
    {
        createUI();
    }

    updateSystemInfo();
    lv_scr_load(screen);
    visible = true;

    Serial.println("SystemSettingsScreen: System settings screen shown");
}

void SystemSettingsScreen::hide()
{
    visible = false;
}

void SystemSettingsScreen::update()
{
    if (visible)
    {
        static uint32_t lastUpdate = 0;
        if (millis() - lastUpdate > 5000) // Update every 5 seconds
        {
            lastUpdate = millis();
            updateSystemInfo();
        }
    }
}

void SystemSettingsScreen::setBackToSettingsCallback(BackToSettingsCallback callback)
{
    onBackToSettings = callback;
}

bool SystemSettingsScreen::isVisible() const
{
    return visible;
}

void SystemSettingsScreen::createUI()
{
    if (screen)
        return;

    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x0F0F0F), 0);

    // Create header using the component
    header = new SettingsHeader();
    header->create(screen, "System", [this]()
                   {
        if (onBackToSettings) {
            onBackToSettings();
        } });

    // Main content area with scroll
    lv_obj_t *contentArea = lv_obj_create(screen);
    lv_obj_set_size(contentArea, 235, 255); // Adjusted for header component height
    lv_obj_align(contentArea, LV_ALIGN_TOP_MID, 0, SettingsHeader::getHeight() + 5);
    lv_obj_set_style_bg_color(contentArea, lv_color_hex(0x0F0F0F), 0);
    lv_obj_set_style_border_width(contentArea, 0, 0);
    lv_obj_set_style_radius(contentArea, 0, 0);
    lv_obj_set_style_pad_all(contentArea, 5, 0);
    lv_obj_set_scroll_dir(contentArea, LV_DIR_VER);

    // System info label
    infoLabel = lv_label_create(contentArea);
    lv_label_set_text(infoLabel, "Device: ESP32 CYD\nFirmware: v1.0.0\nFree Memory: Calculating...\nUptime: 0s");
    lv_obj_set_style_text_color(infoLabel, lv_color_hex(0xAAAAAA), 0);
    lv_obj_set_style_text_font(infoLabel, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_align(infoLabel, LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_set_width(infoLabel, 196);
    lv_obj_align(infoLabel, LV_ALIGN_TOP_LEFT, 0, 30);

    // Reset button
    resetButton = lv_btn_create(contentArea);
    lv_obj_set_size(resetButton, 196, 35);
    lv_obj_align(resetButton, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(resetButton, lv_color_hex(0xCC3300), 0);
    lv_obj_set_style_bg_color(resetButton, lv_color_hex(0xFF4400), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(resetButton, 0, 0);
    lv_obj_set_style_radius(resetButton, 6, 0);
    lv_obj_add_event_cb(resetButton, onResetButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *resetLabel = lv_label_create(resetButton);
    lv_label_set_text(resetLabel, LV_SYMBOL_TRASH " Factory Reset");
    lv_obj_set_style_text_font(resetLabel, &lv_font_montserrat_12, 0);
    lv_obj_center(resetLabel);

    Serial.println("SystemSettingsScreen: UI created");
}

void SystemSettingsScreen::updateSystemInfo()
{
    if (!infoLabel)
        return;

    uint32_t freeHeap = ESP.getFreeHeap();
    uint32_t uptime = millis() / 1000;
    uint32_t hours = uptime / 3600;
    uint32_t minutes = (uptime % 3600) / 60;
    uint32_t seconds = uptime % 60;

    String sysInfo = "Device: ESP32 CYD\n";
    sysInfo += "Firmware: " + String(FIRMWARE_FRIENDLY_NAME) + "\n";
    sysInfo += "Variant: " + String(FIRMWARE_VARIANT_FRIENDLY_NAME) + "\n";
    sysInfo += "Version: " + String(FIRMWARE_VERSION) + "\n";
    sysInfo += "Free Memory: " + String(freeHeap / 1024) + " KB\n";
    sysInfo += "Uptime: " + String(hours) + "h " + String(minutes) + "m " + String(seconds) + "s";

    lv_label_set_text(infoLabel, sysInfo.c_str());
}

void SystemSettingsScreen::performFactoryReset()
{
    Serial.println("SystemSettingsScreen: Performing factory reset...");

    // Clear all preference namespaces used by the application

    // 1. Clear general settings
    if (preferences.begin("settings", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("SystemSettingsScreen: Cleared 'settings' namespace");
    }

    // 2. Clear WiFi credentials
    if (preferences.begin("wifi_creds", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("SystemSettingsScreen: Cleared 'wifi_creds' namespace");
    }

    // 3. Clear Attraccess settings
    if (preferences.begin("attraccess", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("SystemSettingsScreen: Cleared 'attraccess' namespace");
    }

    // 4. Clear any other potential namespaces that might be added in the future
    // Note: This could be extended as new settings are added

    Serial.println("SystemSettingsScreen: All stored data cleared");

    // Update info
    if (infoLabel)
    {
        lv_label_set_text(infoLabel, "Factory reset complete!\nRestarting in 3 seconds...");
    }

    // Restart device after delay
    lv_timer_t *timer = lv_timer_create([](lv_timer_t *timer)
                                        {
        ESP.restart();
        lv_timer_del(timer); }, 3000, nullptr);
}

// Event handlers
void SystemSettingsScreen::onResetButtonClicked(lv_event_t *e)
{
    SystemSettingsScreen *screen = (SystemSettingsScreen *)lv_event_get_user_data(e);
    if (screen)
    {
        Serial.println("SystemSettingsScreen: Factory reset button clicked");
        screen->performFactoryReset();
    }
}
