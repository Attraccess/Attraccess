#include "SettingsManager.h"
#include "PinEntryScreen.h"
#include "SettingsListScreen.h"
#include "WiFiSettingsScreen.h"
#include "SystemSettingsScreen.h"
#include "AttraccessSettingsScreen.h"
#include "WiFiPasswordDialog.h"
#include "WiFiService.h"
#include "AttraccessService.h"

static SettingsManager *g_settingsManager = nullptr;

SettingsManager::SettingsManager()
    : pinEntryScreen(nullptr),
      settingsListScreen(nullptr),
      wifiSettingsScreen(nullptr),
      systemSettingsScreen(nullptr),
      attraccessSettingsScreen(nullptr),
      passwordDialog(nullptr),
      wifiService(nullptr),
      attraccessService(nullptr),
      currentScreenType(SCREEN_NONE),
      uiVisible(false)
{
    g_settingsManager = this;
}

SettingsManager::~SettingsManager()
{
    g_settingsManager = nullptr;
    delete pinEntryScreen;
    delete settingsListScreen;
    delete wifiSettingsScreen;
    delete systemSettingsScreen;
    delete attraccessSettingsScreen;
    delete passwordDialog;
}

void SettingsManager::begin()
{
    Serial.println("SettingsManager: Starting initialization...");

    loadSettings();

    // Create screen components
    pinEntryScreen = new PinEntryScreen();
    settingsListScreen = new SettingsListScreen();
    wifiSettingsScreen = new WiFiSettingsScreen();
    systemSettingsScreen = new SystemSettingsScreen();
    attraccessSettingsScreen = new AttraccessSettingsScreen();
    passwordDialog = new WiFiPasswordDialog();

    // Initialize all components
    pinEntryScreen->begin();
    settingsListScreen->begin();
    systemSettingsScreen->begin();
    attraccessSettingsScreen->begin(&keyboardManager);
    passwordDialog->begin(&keyboardManager);

    // Set up PIN entry callbacks
    pinEntryScreen->setPinValidationCallback([this](bool success)
                                             {
        if (success) {
            onPinValidationSuccess();
        } });

    pinEntryScreen->setPinCancelCallback([this]()
                                         { onPinValidationCancel(); });

    // Set up settings list callbacks
    settingsListScreen->setCategorySelectedCallback([this](const String &categoryId)
                                                    { onCategorySelected(categoryId); });

    settingsListScreen->setBackToMainCallback([this]()
                                              { onBackToMain(); });

    // Set up WiFi settings callbacks
    wifiSettingsScreen->setBackToSettingsCallback([this]()
                                                  { onBackToSettings(); });

    // Set up system settings callbacks
    systemSettingsScreen->setBackToSettingsCallback([this]()
                                                    { onBackToSettings(); });

    // Set up attraccess settings callbacks
    attraccessSettingsScreen->setBackToSettingsCallback([this]()
                                                        { onBackToSettings(); });

    // Initialize categories
    initializeCategories();

    Serial.println("SettingsManager: Initialization complete");
}

void SettingsManager::update()
{
    // Update the current screen
    switch (currentScreenType)
    {
    case SCREEN_PIN_ENTRY:
        if (pinEntryScreen)
            pinEntryScreen->update();
        break;
    case SCREEN_SETTINGS_LIST:
        if (settingsListScreen)
            settingsListScreen->update();
        break;
    case SCREEN_WIFI_SETTINGS:
        if (wifiSettingsScreen)
            wifiSettingsScreen->update();
        break;
    case SCREEN_SYSTEM_SETTINGS:
        if (systemSettingsScreen)
            systemSettingsScreen->update();
        break;
    case SCREEN_ATTACCESS_SETTINGS:
        if (attraccessSettingsScreen)
            attraccessSettingsScreen->update();
        break;
    default:
        break;
    }

    // Update password dialog if visible
    if (passwordDialog && passwordDialog->isVisible())
    {
        passwordDialog->update();
    }
}

void SettingsManager::showPinEntryScreen()
{
    if (pinEntryScreen)
    {
        pinEntryScreen->show();
        currentScreenType = SCREEN_PIN_ENTRY;
        uiVisible = true;
    }
}

void SettingsManager::hideSettingsUI()
{
    uiVisible = false;
    currentScreenType = SCREEN_NONE;
    keyboardManager.hide();

    // Hide password dialog if visible
    if (passwordDialog && passwordDialog->isVisible())
    {
        passwordDialog->hide();
    }
}

bool SettingsManager::isSettingsVisible() const
{
    return uiVisible;
}

void SettingsManager::setWiFiManager(WiFiService *service)
{
    wifiService = service;
    Serial.println("SettingsManager: WiFiService reference set");

    // Initialize WiFi settings screen with dependencies
    if (wifiSettingsScreen && passwordDialog)
    {
        Serial.printf("SettingsManager: Initializing WiFiSettingsScreen with wifiService=%p, passwordDialog=%p\n", wifiService, passwordDialog);
        wifiSettingsScreen->begin(wifiService, passwordDialog);
    }
    else
    {
        Serial.printf("SettingsManager: Cannot initialize WiFiSettingsScreen - wifiSettingsScreen=%p, passwordDialog=%p\n", wifiSettingsScreen, passwordDialog);
    }

    // Set up callbacks for UI updates
    if (wifiService)
    {
        Serial.println("SettingsManager: Setting up WiFiService callbacks");
        wifiService->setScanCompleteCallback(onWiFiScanComplete);
        wifiService->setScanProgressCallback(onWiFiScanProgress);

        // Set up connection callback to forward to our onWiFiConnectionChange method
        wifiService->setConnectionCallback(onWiFiConnectionChange);
        Serial.println("SettingsManager: WiFiService callbacks registered successfully");
    }
    else
    {
        Serial.println("SettingsManager: ERROR - wifiService is null, cannot set callbacks!");
    }
}

void SettingsManager::setAttraccessService(AttraccessService *service)
{
    attraccessService = service;
    Serial.println("SettingsManager: AttraccessService reference set");

    // Set up the settings saved callback
    if (attraccessSettingsScreen && attraccessService)
    {
        attraccessSettingsScreen->setSettingsSavedCallback([this](const String &hostname, uint16_t port)
                                                           {
            Serial.printf("SettingsManager: Attraccess settings updated - %s:%d\n", hostname.c_str(), port);
            attraccessService->setServerConfig(hostname, port); });
    }
}

void SettingsManager::handleWiFiConnectionChange(bool connected, const String &ssid)
{
    // Forward the event to the WiFi settings screen if it's currently visible
    if (currentScreenType == SCREEN_WIFI_SETTINGS && wifiSettingsScreen)
    {
        wifiSettingsScreen->onWiFiConnectionChange(connected, ssid);
    }
}

void SettingsManager::handleAttraccessConnectionChange(bool connected, bool authenticated, const String &status)
{
    // Always update the Attraccess settings screen so it shows current status when reopened
    if (attraccessSettingsScreen)
    {
        attraccessSettingsScreen->updateConnectionStatus(status, connected, authenticated);
    }
}

void SettingsManager::initializeCategories()
{
    if (!settingsListScreen)
        return;

    settingsListScreen->clearCategories();

    // WiFi & Network category
    settingsListScreen->addCategory("wifi", "WiFi & Network", LV_SYMBOL_WIFI,
                                    "Configure wireless connections", lv_color_hex(0x00AA44));

    // Attraccess category
    settingsListScreen->addCategory("attraccess", "Attraccess", LV_SYMBOL_SETTINGS,
                                    "Server hostname and port", lv_color_hex(0x8800FF));

    // System & Info category
    settingsListScreen->addCategory("system", "System & Info", LV_SYMBOL_LIST,
                                    "Device information and reset", lv_color_hex(0xFF6600));

    // Future categories can be added here:
    // Display & Theme, Security, About, etc.
}

void SettingsManager::showSettingsListScreen()
{
    if (settingsListScreen)
    {
        settingsListScreen->show();
        currentScreenType = SCREEN_SETTINGS_LIST;
        uiVisible = true;
    }
}

void SettingsManager::showWiFiSettingsScreen()
{
    if (wifiSettingsScreen)
    {
        wifiSettingsScreen->show();
        currentScreenType = SCREEN_WIFI_SETTINGS;
        uiVisible = true;
    }
}

void SettingsManager::showSystemSettingsScreen()
{
    if (systemSettingsScreen)
    {
        systemSettingsScreen->show();
        currentScreenType = SCREEN_SYSTEM_SETTINGS;
        uiVisible = true;
    }
}

void SettingsManager::showAttraccessSettingsScreen()
{
    if (attraccessSettingsScreen)
    {
        attraccessSettingsScreen->show();
        currentScreenType = SCREEN_ATTACCESS_SETTINGS;
        uiVisible = true;

        // Update the connection status immediately when screen is shown
        if (attraccessService)
        {
            bool connected = attraccessService->isConnected();
            bool authenticated = attraccessService->isAuthenticated();
            String status = attraccessService->getConnectionStateString();
            attraccessSettingsScreen->updateConnectionStatus(status, connected, authenticated);
        }
    }
}

void SettingsManager::returnToSettingsList()
{
    showSettingsListScreen();
}

void SettingsManager::saveSettings()
{
    // Placeholder for settings persistence
    Serial.println("Settings saved");
}

void SettingsManager::loadSettings()
{
    // Placeholder for settings loading
    Serial.println("Settings loaded");
}

// Screen navigation callbacks
void SettingsManager::onPinValidationSuccess()
{
    Serial.println("SettingsManager: PIN validation successful - showing settings list");
    showSettingsListScreen();
}

void SettingsManager::onPinValidationCancel()
{
    Serial.println("SettingsManager: PIN validation cancelled - hiding settings");
    hideSettingsUI();
}

void SettingsManager::onCategorySelected(const String &categoryId)
{
    Serial.printf("SettingsManager: Category '%s' selected\n", categoryId.c_str());

    if (categoryId.equals("wifi"))
    {
        showWiFiSettingsScreen();
    }
    else if (categoryId.equals("system"))
    {
        showSystemSettingsScreen();
    }
    else if (categoryId.equals("attraccess"))
    {
        showAttraccessSettingsScreen();
    }
    else
    {
        Serial.printf("SettingsManager: Unknown category '%s'\n", categoryId.c_str());
    }
}

void SettingsManager::onBackToMain()
{
    Serial.println("SettingsManager: Returning to main screen");
    hideSettingsUI();
}

void SettingsManager::onBackToSettings()
{
    Serial.println("SettingsManager: Returning to settings list");
    returnToSettingsList();
}

// Static WiFiService callbacks
void SettingsManager::onWiFiScanComplete(WiFiNetwork *networks, uint8_t count)
{
    Serial.printf("SettingsManager: Scan complete callback - %d networks found\n", count);

    // Forward to the WiFiSettingsScreen if it's currently visible
    // We need a way to access the instance - store a static reference
    if (g_settingsManager && g_settingsManager->currentScreenType == SCREEN_WIFI_SETTINGS &&
        g_settingsManager->wifiSettingsScreen)
    {
        Serial.println("SettingsManager: Forwarding scan complete to WiFiSettingsScreen");
        g_settingsManager->wifiSettingsScreen->updateAvailableNetworks();
    }
    else
    {
        Serial.printf("SettingsManager: Not forwarding scan complete - manager=%p, screenType=%d, wifiScreen=%p\n",
                      g_settingsManager,
                      g_settingsManager ? g_settingsManager->currentScreenType : -1,
                      g_settingsManager ? g_settingsManager->wifiSettingsScreen : nullptr);
    }
}

void SettingsManager::onWiFiScanProgress(const String &status)
{
    Serial.println("SettingsManager: Scan progress - " + status);
}

void SettingsManager::onWiFiConnectionChange(bool connected, const String &ssid)
{
    if (g_settingsManager)
    {
        g_settingsManager->handleWiFiConnectionChange(connected, ssid);
    }
}