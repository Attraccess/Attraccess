#include "WiFiManager.h"
#include "KeyboardManager.h"

static WiFiManager *g_wifiManager = nullptr;

WiFiManager::WiFiManager() : networkCount(0),
                             isScanning(false),
                             isConnecting(false),
                             uiVisible(false),
                             connectionCallback(nullptr),
                             connectionStartTime(0),
                             wifiScreen(nullptr),
                             networkList(nullptr),
                             scanButton(nullptr),
                             statusLabel(nullptr),
                             mainBackButton(nullptr),
                             credentialsScreen(nullptr),
                             selectedNetworkLabel(nullptr),
                             passwordTextArea(nullptr),
                             connectButton(nullptr),
                             backButton(nullptr),
                             launchContext(STANDALONE)
{
    g_wifiManager = this;
}

WiFiManager::~WiFiManager()
{
    if (wifiScreen)
    {
        lv_obj_del(wifiScreen);
    }
    if (credentialsScreen)
    {
        lv_obj_del(credentialsScreen);
    }
    g_wifiManager = nullptr;
}

void WiFiManager::begin()
{
    WiFi.mode(WIFI_STA);
    WiFi.onEvent(onWiFiEvent);

    // Create WiFi UI screens
    createWiFiUI();
    createCredentialsUI();

    // Try to auto-connect with saved credentials first
    Serial.println("Checking for saved WiFi credentials...");
    if (tryAutoConnect())
    {
        Serial.println("Auto-connecting with saved credentials...");
        // If auto-connect is attempted, let the connection process handle UI
        return;
    }

    // No saved credentials - don't show UI during startup
    Serial.println("No saved credentials found - UI will be shown when explicitly requested");
}

void WiFiManager::update()
{
    // Handle WiFi connection timeout
    if (isConnecting)
    {
        uint32_t currentTime = millis();
        if (currentTime - connectionStartTime > 15000) // 15 second timeout
        {
            updateStatus("Connection timeout. Please try again.");
            isConnecting = false;
            WiFi.disconnect();

            // Auto-connect timeout - don't automatically show UI
            if (!uiVisible)
            {
                Serial.println("Auto-connect timeout - WiFi UI available through settings");
            }
        }
        else
        {
            // Update connecting status with dots animation
            uint32_t elapsed = (currentTime - connectionStartTime) / 500;
            String dots = "";
            for (int i = 0; i < (elapsed % 4); i++)
            {
                dots += ".";
            }
            updateStatus("Connecting" + dots);
        }
    }

    // Handle WiFi connection status updates
    if (uiVisible && statusLabel)
    {
        if (WiFi.isConnected() && !isConnecting)
        {
            updateStatus("Connected to: " + WiFi.SSID() + " (IP: " + WiFi.localIP().toString() + ")");
            // Note: Screen transition is now handled by main.cpp callback
        }
    }
}

bool WiFiManager::isConnected()
{
    return WiFi.isConnected();
}

String WiFiManager::getConnectedSSID()
{
    return WiFi.SSID();
}

String WiFiManager::getLocalIP()
{
    return WiFi.localIP().toString();
}

void WiFiManager::showWiFiSelectionUI()
{
    if (!wifiScreen)
    {
        Serial.println("WiFiManager: Creating WiFi UI for first time...");
        createWiFiUI();
    }

    if (wifiScreen)
    {
        Serial.println("WiFiManager: Showing WiFi selection UI");
        lv_scr_load(wifiScreen);
        uiVisible = true;
        Serial.printf("WiFi UI loaded, current screen: %p\n", lv_scr_act());
    }
    else
    {
        Serial.println("WiFiManager: ERROR - Failed to create WiFi UI");
    }
}

void WiFiManager::hideWiFiSelectionUI()
{
    Serial.println("WiFiManager: Hiding WiFi UI");

    // Hide keyboard first
    keyboardManager.hide();

    // Mark UI as not visible
    uiVisible = false;

    Serial.println("WiFiManager: WiFi UI hidden");
    // Note: External code should load the appropriate screen after hiding WiFi UI
}

void WiFiManager::scanNetworks()
{
    if (isScanning || isConnecting)
        return;

    isScanning = true;
    updateStatus("Scanning for networks...");

    WiFi.scanNetworks(true, false, false, 300U, 0U);
}

void WiFiManager::connectToNetwork(const String &ssid, const String &password)
{
    // Prevent multiple simultaneous connection attempts
    if (isConnecting)
    {
        updateStatus("Already connecting...");
        return;
    }

    // Disconnect from any existing connection first (non-blocking)
    if (WiFi.isConnected())
    {
        WiFi.disconnect();
        // Remove blocking delay - let WiFi handle disconnect asynchronously
    }

    currentCredentials.ssid = ssid;
    currentCredentials.password = password;
    isConnecting = true;
    connectionStartTime = millis();

    updateStatus("Connecting to " + ssid + "...");
    Serial.println("Starting WiFi connection to: " + ssid);

    // Start non-blocking connection attempt
    if (password.length() > 0)
    {
        WiFi.begin(ssid.c_str(), password.c_str());
    }
    else
    {
        WiFi.begin(ssid.c_str());
    }

    // Use multiple yields to keep UI responsive
    for (int i = 0; i < 10; i++)
    {
        yield();
        delayMicroseconds(100); // Very short non-blocking delay
    }
}

void WiFiManager::disconnect()
{
    isConnecting = false;
    WiFi.disconnect();
    updateStatus("Disconnected");
}

void WiFiManager::setConnectionCallback(ConnectionCallback callback)
{
    connectionCallback = callback;
}

void WiFiManager::saveCredentials(const String &ssid, const String &password)
{
    Serial.println("Saving WiFi credentials securely...");

    // Open preferences with encryption enabled
    if (preferences.begin("wifi_creds", false))
    {
        preferences.putString("ssid", ssid);
        preferences.putString("password", password);
        preferences.putBool("has_creds", true);
        preferences.end();

        Serial.println("WiFi credentials saved successfully");
    }
    else
    {
        Serial.println("Failed to open preferences for saving credentials");
    }
}

bool WiFiManager::loadSavedCredentials(String &ssid, String &password)
{
    // Open preferences in read-only mode
    if (preferences.begin("wifi_creds", true))
    {
        bool hasCreds = preferences.getBool("has_creds", false);

        if (hasCreds)
        {
            ssid = preferences.getString("ssid", "");
            password = preferences.getString("password", "");
            preferences.end();

            // Validate that we actually got valid credentials
            if (ssid.length() > 0)
            {
                Serial.println("Loaded saved WiFi credentials for: " + ssid);
                return true;
            }
        }
        preferences.end();
    }

    Serial.println("No valid saved credentials found");
    return false;
}

void WiFiManager::clearSavedCredentials()
{
    Serial.println("Clearing saved WiFi credentials...");

    if (preferences.begin("wifi_creds", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("WiFi credentials cleared");
    }
    else
    {
        Serial.println("Failed to open preferences for clearing credentials");
    }
}

bool WiFiManager::hasSavedCredentials()
{
    if (preferences.begin("wifi_creds", true))
    {
        bool hasCreds = preferences.getBool("has_creds", false);
        preferences.end();
        return hasCreds;
    }
    return false;
}

bool WiFiManager::tryAutoConnect()
{
    String savedSSID, savedPassword;

    if (!loadSavedCredentials(savedSSID, savedPassword))
    {
        return false; // No saved credentials
    }

    Serial.println("Attempting auto-connect to: " + savedSSID);

    // Use the existing connectToNetwork method but don't save credentials again
    currentCredentials.ssid = savedSSID;
    currentCredentials.password = savedPassword;
    isConnecting = true;
    connectionStartTime = millis();

    // Start non-blocking connection attempt
    if (savedPassword.length() > 0)
    {
        WiFi.begin(savedSSID.c_str(), savedPassword.c_str());
    }
    else
    {
        WiFi.begin(savedSSID.c_str());
    }

    yield();
    return true; // Auto-connect attempted
}

void WiFiManager::createWiFiUI()
{
    if (wifiScreen)
        return;

    wifiScreen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(wifiScreen, lv_color_hex(0x000000), 0);

    // Title
    lv_obj_t *title = lv_label_create(wifiScreen);
    lv_label_set_text(title, "WiFi Networks");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 5);

    // Scan button
    scanButton = lv_btn_create(wifiScreen);
    lv_obj_set_size(scanButton, 220, 25);
    lv_obj_align(scanButton, LV_ALIGN_TOP_MID, 0, 25);
    lv_obj_add_event_cb(scanButton, onScanButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *scanLabel = lv_label_create(scanButton);
    lv_label_set_text(scanLabel, "Scan for Networks");
    lv_obj_center(scanLabel);

    // Status label
    statusLabel = lv_label_create(wifiScreen);
    lv_label_set_text(statusLabel, "Ready");
    lv_obj_set_style_text_color(statusLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(statusLabel, LV_ALIGN_TOP_MID, 0, 55);

    // Network list
    networkList = lv_list_create(wifiScreen);
    lv_obj_set_size(networkList, 220, 200); // Reduced height to make room for back button
    lv_obj_align(networkList, LV_ALIGN_TOP_MID, 0, 75);

    // Main back button - to exit WiFi UI and return to main screen
    mainBackButton = lv_btn_create(wifiScreen);
    lv_obj_set_size(mainBackButton, 220, 30);
    lv_obj_align(mainBackButton, LV_ALIGN_BOTTOM_MID, 0, -10);
    lv_obj_add_event_cb(mainBackButton, onMainBackButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *mainBackLabel = lv_label_create(mainBackButton);
    lv_label_set_text(mainBackLabel, "Back to Main");
    lv_obj_center(mainBackLabel);
}

void WiFiManager::createCredentialsUI()
{
    if (credentialsScreen)
        return;

    credentialsScreen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(credentialsScreen, lv_color_hex(0x000000), 0);

    // Title
    lv_obj_t *title = lv_label_create(credentialsScreen);
    lv_label_set_text(title, "WiFi Password");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 10);

    // Selected network label
    selectedNetworkLabel = lv_label_create(credentialsScreen);
    lv_label_set_text(selectedNetworkLabel, "Network: ");
    lv_obj_set_style_text_color(selectedNetworkLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(selectedNetworkLabel, LV_ALIGN_TOP_MID, 0, 35);

    // Password input
    passwordTextArea = lv_textarea_create(credentialsScreen);
    lv_obj_set_size(passwordTextArea, 220, 35);
    lv_obj_align(passwordTextArea, LV_ALIGN_CENTER, 0, -20);
    lv_textarea_set_placeholder_text(passwordTextArea, "Enter WiFi password");
    lv_obj_add_event_cb(passwordTextArea, onPasswordTextAreaClicked, LV_EVENT_CLICKED, this);

    // Connect button
    connectButton = lv_btn_create(credentialsScreen);
    lv_obj_set_size(connectButton, 220, 30);
    lv_obj_align(connectButton, LV_ALIGN_CENTER, 0, 40);
    lv_obj_add_event_cb(connectButton, onConnectButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *connectLabel = lv_label_create(connectButton);
    lv_label_set_text(connectLabel, "Connect");
    lv_obj_center(connectLabel);

    // Back button
    backButton = lv_btn_create(credentialsScreen);
    lv_obj_set_size(backButton, 220, 30);
    lv_obj_align(backButton, LV_ALIGN_BOTTOM_MID, 0, -10);
    lv_obj_add_event_cb(backButton, onBackButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *backLabel = lv_label_create(backButton);
    lv_label_set_text(backLabel, "Back to Networks");
    lv_obj_center(backLabel);
}

void WiFiManager::updateNetworkList()
{
    if (!networkList)
        return;

    lv_obj_clean(networkList);

    for (uint8_t i = 0; i < networkCount; i++)
    {
        WiFiNetwork &network = availableNetworks[i];
        lv_obj_t *btn = lv_list_add_btn(networkList, LV_SYMBOL_WIFI, network.ssid.c_str());
        lv_obj_add_event_cb(btn, onNetworkSelected, LV_EVENT_CLICKED, this);

        // Store SSID in user data
        lv_obj_set_user_data(btn, (void *)network.ssid.c_str());
    }
}

void WiFiManager::updateStatus(const String &message)
{
    if (statusLabel)
    {
        lv_label_set_text(statusLabel, message.c_str());
    }
    Serial.println("WiFi Status: " + message);
}

void WiFiManager::showCredentialsScreen(const String &ssid)
{
    Serial.println("WiFiManager: Switching to credentials screen for: " + ssid);

    selectedSSID = ssid;

    if (!credentialsScreen)
    {
        createCredentialsUI();
    }

    // Update the selected network label
    if (selectedNetworkLabel)
    {
        lv_label_set_text(selectedNetworkLabel, ("Network: " + ssid).c_str());
    }

    // Clear any previous password
    if (passwordTextArea)
    {
        lv_textarea_set_text(passwordTextArea, "");
    }

    // Hide any existing keyboard
    keyboardManager.hide();

    // Remove blocking delay - LVGL handles transitions asynchronously
    // Switch to credentials screen immediately

    // Switch to credentials screen
    lv_scr_load(credentialsScreen);
    uiVisible = true;

    Serial.println("WiFiManager: Credentials screen loaded");
}

void WiFiManager::showNetworkList()
{
    if (wifiScreen)
    {
        Serial.println("WiFiManager: Switching to network list screen");

        // Hide keyboard if visible
        keyboardManager.hide();

        // Remove blocking delay - use immediate screen transition
        // The keyboard hiding is handled asynchronously by LVGL

        // Switch back to main WiFi screen
        lv_scr_load(wifiScreen);
        uiVisible = true;

        Serial.println("WiFiManager: Network list screen loaded");
    }
    else
    {
        Serial.println("WiFiManager: Error - wifiScreen is null!");
    }
}

void WiFiManager::onNetworkSelected(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    lv_obj_t *btn = (lv_obj_t *)lv_event_get_target(e);
    const char *ssid = (const char *)lv_obj_get_user_data(btn);

    if (manager && ssid)
    {
        // Find if network is open
        bool isOpen = false;
        for (uint8_t i = 0; i < manager->networkCount; i++)
        {
            if (manager->availableNetworks[i].ssid.equals(ssid))
            {
                isOpen = manager->availableNetworks[i].isOpen;
                break;
            }
        }

        if (isOpen)
        {
            // Connect immediately for open networks
            manager->connectToNetwork(ssid, "");
        }
        else
        {
            // Show credentials screen for secured networks
            manager->showCredentialsScreen(ssid);
        }
    }
}

void WiFiManager::onScanButtonClicked(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    if (manager)
    {
        manager->scanNetworks();
    }
}

void WiFiManager::onConnectButtonClicked(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    if (manager && manager->passwordTextArea)
    {
        const char *password = lv_textarea_get_text(manager->passwordTextArea);

        // Hide keyboard immediately for better responsiveness
        manager->keyboardManager.hide();

        // Clear password field for security immediately
        lv_textarea_set_text(manager->passwordTextArea, "");

        // Update status to show we're processing
        manager->updateStatus("Initiating connection...");

        // Yield to keep UI responsive before starting connection
        yield();

        // Start connection (this will update status to "Connecting...")
        manager->connectToNetwork(manager->selectedSSID, password);

        // Yield again to allow WiFi operations to start
        yield();

        // Switch back to network list after a brief moment to show connection status
        manager->showNetworkList();

        // Additional yield to ensure screen transition completes
        yield();
    }
}

void WiFiManager::onBackButtonClicked(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    if (manager)
    {
        manager->showNetworkList();
    }
}

void WiFiManager::onMainBackButtonClicked(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    if (manager)
    {
        Serial.println("Main back button clicked - returning to main screen");
        manager->setLaunchContext(STANDALONE); // Reset context since user is exiting to main
        manager->hideWiFiSelectionUI();
    }
}

void WiFiManager::onPasswordTextAreaClicked(lv_event_t *e)
{
    WiFiManager *manager = (WiFiManager *)lv_event_get_user_data(e);
    if (manager && manager->credentialsScreen && manager->passwordTextArea)
    {
        // Attach keyboard manager to the text area if not already done
        if (!manager->keyboardManager.getKeyboard())
        {
            manager->keyboardManager.attachToTextArea(manager->credentialsScreen, manager->passwordTextArea);
        }

        // Show the keyboard
        manager->keyboardManager.show();
    }
}

void WiFiManager::onWiFiEvent(WiFiEvent_t event)
{
    if (!g_wifiManager)
        return;

    switch (event)
    {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        g_wifiManager->isConnecting = false;
        g_wifiManager->updateStatus("WiFi connected successfully");

        // Save credentials securely on successful connection
        if (g_wifiManager->currentCredentials.ssid.length() > 0)
        {
            g_wifiManager->saveCredentials(g_wifiManager->currentCredentials.ssid,
                                           g_wifiManager->currentCredentials.password);
        }

        if (g_wifiManager->connectionCallback)
        {
            g_wifiManager->connectionCallback(true, WiFi.SSID());
        }
        break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
        if (g_wifiManager->isConnecting)
        {
            // This is a connection failure, not a normal disconnect
            Serial.println("WiFi connection failed - returning to network list");
            g_wifiManager->updateStatus("Connection failed. Check password.");
            g_wifiManager->isConnecting = false;

            // Always show network list on connection failure (whether auto-connect or manual)
            if (!g_wifiManager->uiVisible)
            {
                Serial.println("Auto-connect failed, showing WiFi selection UI...");
                g_wifiManager->setLaunchContext(STANDALONE);
                g_wifiManager->showWiFiSelectionUI();
                g_wifiManager->scanNetworks();
            }
            else
            {
                // If UI is visible, ensure we're on the network list (not credentials screen)
                g_wifiManager->showNetworkList();
            }
        }
        else
        {
            g_wifiManager->updateStatus("WiFi disconnected");
        }

        if (g_wifiManager->connectionCallback)
        {
            g_wifiManager->connectionCallback(false, "");
        }
        break;

    case ARDUINO_EVENT_WIFI_SCAN_DONE:
    {
        g_wifiManager->isScanning = false;
        int scannedNetworkCount = WiFi.scanComplete();
        g_wifiManager->networkCount = 0;

        if (scannedNetworkCount > 0)
        {
            for (int i = 0; i < scannedNetworkCount && g_wifiManager->networkCount < MAX_WIFI_NETWORKS; i++)
            {
                WiFiNetwork network;
                network.ssid = WiFi.SSID(i);
                network.rssi = WiFi.RSSI(i);
                network.encryptionType = WiFi.encryptionType(i);
                network.isOpen = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
                network.channel = WiFi.channel(i);

                if (network.ssid.length() > 0)
                {
                    g_wifiManager->availableNetworks[g_wifiManager->networkCount] = network;
                    g_wifiManager->networkCount++;
                }
            }

            g_wifiManager->updateNetworkList();
            g_wifiManager->updateStatus("Found " + String(g_wifiManager->networkCount) + " networks");
        }
        else
        {
            g_wifiManager->updateStatus("No networks found");
        }

        WiFi.scanDelete();
    }
    break;

    default:
        break;
    }
}

String WiFiManager::getEncryptionTypeString(wifi_auth_mode_t encType)
{
    switch (encType)
    {
    case WIFI_AUTH_OPEN:
        return "Open";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2 Enterprise";
    case WIFI_AUTH_WPA3_PSK:
        return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:
        return "WPA2/WPA3";
    case WIFI_AUTH_WAPI_PSK:
        return "WAPI";
    default:
        return "Unknown";
    }
}

int WiFiManager::getSignalStrength(int32_t rssi)
{
    if (rssi >= -50)
        return 100;
    if (rssi >= -60)
        return 80;
    if (rssi >= -70)
        return 60;
    if (rssi >= -80)
        return 40;
    if (rssi >= -90)
        return 20;
    return 0;
}