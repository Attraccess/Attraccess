#include "WiFiSettingsScreen.h"

WiFiSettingsScreen::WiFiSettingsScreen()
    : screen(nullptr),
      header(nullptr),
      refreshButton(nullptr),
      wifiStatusLabel(nullptr),
      wifiCurrentNetworkCard(nullptr),
      wifiNetworksList(nullptr),
      wifiScanningLabel(nullptr),
      forgetWiFiButton(nullptr),
      wifiConnectionProgress(nullptr),
      wifiConnectionSpinner(nullptr),
      wifiConnectionLabel(nullptr),
      visible(false),
      connectingNetworkSSID(""),
      connectionTimeoutTimer(nullptr),
      wifiService(nullptr),
      passwordDialog(nullptr),
      onBackToSettings(nullptr)
{
}

WiFiSettingsScreen::~WiFiSettingsScreen()
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

    // Clean up any pending timers
    if (connectionTimeoutTimer)
    {
        lv_timer_del(connectionTimeoutTimer);
        connectionTimeoutTimer = nullptr;
    }
}

void WiFiSettingsScreen::begin(WiFiService *wifiSvc, WiFiPasswordDialog *passwordDlg)
{
    Serial.printf("WiFiSettingsScreen: begin() called with wifiSvc=%p, passwordDlg=%p\n", wifiSvc, passwordDlg);
    wifiService = wifiSvc;
    passwordDialog = passwordDlg;

    // Set up password dialog callbacks
    if (passwordDialog)
    {
        passwordDialog->setConnectCallback([this](const String &ssid, const String &password)
                                           {
            Serial.printf("WiFiSettingsScreen: Connecting to '%s' with password\n", ssid.c_str());
            
            // Set connecting network for visual indicator
            connectingNetworkSSID = ssid;
            
            // Show immediate connection feedback
            showWiFiConnectionProgress(ssid, "Attempting to connect...");
            
            // Start connection timeout
            startConnectionTimeout(ssid);
            
            // Connect to network
            if (wifiService)
            {
                wifiService->connectToNetwork(ssid, password);
            } });

        passwordDialog->setCancelCallback([this]()
                                          { Serial.println("WiFiSettingsScreen: Password dialog cancelled"); });
    }

    // UI will be created when first shown
}

void WiFiSettingsScreen::show()
{
    if (!screen)
    {
        createUI();
    }

    Serial.println("WiFiSettingsScreen: Showing WiFi settings screen");

    updateWiFiStatus();
    lv_scr_load(screen);
    visible = true;

    // Start network scan if not already scanning
    if (wifiService && !wifiService->isScanning())
    {
        Serial.println("WiFiSettingsScreen: Starting automatic network scan");
        refreshNetworkScan();
    }
}

void WiFiSettingsScreen::hide()
{
    visible = false;
}

void WiFiSettingsScreen::update()
{
    if (visible)
    {
        static uint32_t lastUpdate = 0;
        if (millis() - lastUpdate > 5000) // Update every 5 seconds
        {
            lastUpdate = millis();
            updateWiFiStatus();
        }
    }
}

void WiFiSettingsScreen::setBackToSettingsCallback(BackToSettingsCallback callback)
{
    onBackToSettings = callback;
}

bool WiFiSettingsScreen::isVisible() const
{
    return visible;
}

void WiFiSettingsScreen::onWiFiConnectionChange(bool connected, const String &ssid)
{
    // Update WiFi status if settings is visible
    if (visible && screen && lv_scr_act() == screen)
    {
        // Handle connection status feedback
        if (connected)
        {
            // Connection successful - only show progress if we were trying to connect to this network
            if (connectingNetworkSSID.equals(ssid))
            {
                showWiFiConnectionProgress(ssid, "Successfully connected!", false);

                // Clear connecting network SSID
                connectingNetworkSSID = "";

                // Auto-hide success message after 2 seconds
                lv_timer_create([](lv_timer_t *timer)
                                {
                    WiFiSettingsScreen *self = (WiFiSettingsScreen *)timer->user_data;
                    self->hideWiFiConnectionProgress();
                    lv_timer_del(timer); }, 2000, this);
            }
        }
        else
        {
            // Connection failed or disconnected
            if (connectingNetworkSSID.length() > 0 && connectingNetworkSSID.equals(ssid))
            {
                // Failed to connect to the network we were attempting
                showWiFiConnectionProgress(ssid, "Failed to connect", true);

                // Clear connecting network SSID after failure
                connectingNetworkSSID = "";
            }
            else if (connectingNetworkSSID.length() == 0)
            {
                // General disconnection - hide any progress
                hideWiFiConnectionProgress();
            }
        }

        updateWiFiStatus();
    }
}

void WiFiSettingsScreen::createUI()
{
    if (screen)
        return;

    Serial.println("WiFiSettingsScreen: Creating new iPhone/Android style WiFi settings UI");

    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x0F0F0F), 0);

    // Create header using shared component
    header = new SettingsHeader();
    lv_obj_t *headerContainer = header->create(screen, "WiFi", [this]()
                                               {
        if (onBackToSettings) {
            onBackToSettings();
        } });

    // Add refresh button to the header container
    refreshButton = lv_btn_create(headerContainer);
    lv_obj_set_size(refreshButton, 30, 30);
    lv_obj_align(refreshButton, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_color(refreshButton, lv_color_hex(0x333333), 0);
    lv_obj_set_style_bg_color(refreshButton, lv_color_hex(0x555555), LV_STATE_PRESSED);
    lv_obj_set_style_radius(refreshButton, 15, 0);
    lv_obj_set_style_border_width(refreshButton, 0, 0);
    lv_obj_add_event_cb(refreshButton, onRefreshNetworksClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *refreshIcon = lv_label_create(refreshButton);
    lv_label_set_text(refreshIcon, LV_SYMBOL_REFRESH);
    lv_obj_set_style_text_font(refreshIcon, &lv_font_montserrat_14, 0);
    lv_obj_center(refreshIcon);

    // Main scroll area - single scroll container for everything
    lv_obj_t *scrollArea = lv_obj_create(screen);
    lv_obj_set_size(scrollArea, 240, 270); // Increased height since no bottom back button
    lv_obj_align(scrollArea, LV_ALIGN_TOP_MID, 0, SettingsHeader::getHeight() + 5);
    lv_obj_set_style_bg_color(scrollArea, lv_color_hex(0x0F0F0F), 0);
    lv_obj_set_style_border_width(scrollArea, 0, 0);
    lv_obj_set_style_radius(scrollArea, 0, 0);
    lv_obj_set_style_pad_all(scrollArea, 5, 0);
    lv_obj_set_scroll_dir(scrollArea, LV_DIR_VER);
    lv_obj_set_flex_flow(scrollArea, LV_FLEX_FLOW_COLUMN); // Use flex layout for automatic positioning

    // Current Network Section (initially hidden, shown when connected)
    wifiCurrentNetworkCard = lv_obj_create(scrollArea);
    lv_obj_set_size(wifiCurrentNetworkCard, 230, 70);
    lv_obj_set_style_bg_color(wifiCurrentNetworkCard, lv_color_hex(0x1A1A1A), 0);
    lv_obj_set_style_border_color(wifiCurrentNetworkCard, lv_color_hex(0x00AA44), 0);
    lv_obj_set_style_border_width(wifiCurrentNetworkCard, 1, 0);
    lv_obj_set_style_radius(wifiCurrentNetworkCard, 8, 0);
    lv_obj_set_style_pad_all(wifiCurrentNetworkCard, 12, 0);
    lv_obj_set_style_margin_bottom(wifiCurrentNetworkCard, 5, 0);
    lv_obj_clear_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_SCROLLABLE); // Remove scrollbars

    // Current network header
    lv_obj_t *currentHeader = lv_obj_create(wifiCurrentNetworkCard);
    lv_obj_set_size(currentHeader, 206, 20);
    lv_obj_align(currentHeader, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(currentHeader, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(currentHeader, 0, 0);
    lv_obj_set_style_pad_all(currentHeader, 0, 0);

    lv_obj_t *connectedIcon = lv_label_create(currentHeader);
    lv_label_set_text(connectedIcon, LV_SYMBOL_WIFI);
    lv_obj_set_style_text_font(connectedIcon, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(connectedIcon, lv_color_hex(0x00AA44), 0);
    lv_obj_align(connectedIcon, LV_ALIGN_LEFT_MID, 0, 0);

    lv_obj_t *connectedLabel = lv_label_create(currentHeader);
    lv_label_set_text(connectedLabel, "Connected");
    lv_obj_set_style_text_font(connectedLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(connectedLabel, lv_color_hex(0x00AA44), 0);
    lv_obj_align(connectedLabel, LV_ALIGN_LEFT_MID, 25, 0);

    // Forget button for current network
    forgetWiFiButton = lv_btn_create(currentHeader);
    lv_obj_set_size(forgetWiFiButton, 60, 20);
    lv_obj_align(forgetWiFiButton, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_color(forgetWiFiButton, lv_color_hex(0xCC3300), 0);
    lv_obj_set_style_bg_color(forgetWiFiButton, lv_color_hex(0xFF4400), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(forgetWiFiButton, 0, 0);
    lv_obj_set_style_radius(forgetWiFiButton, 4, 0);
    lv_obj_add_event_cb(forgetWiFiButton, onForgetWiFiButtonClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *forgetLabel = lv_label_create(forgetWiFiButton);
    lv_label_set_text(forgetLabel, "Forget");
    lv_obj_set_style_text_font(forgetLabel, &lv_font_montserrat_10, 0);
    lv_obj_center(forgetLabel);

    // Current network status (SSID, IP)
    wifiStatusLabel = lv_label_create(wifiCurrentNetworkCard);
    lv_label_set_text(wifiStatusLabel, "MyNetwork\n192.168.1.100");
    lv_obj_set_style_text_color(wifiStatusLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(wifiStatusLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_width(wifiStatusLabel, 206);
    lv_obj_align(wifiStatusLabel, LV_ALIGN_TOP_LEFT, 0, 25);

    // Available Networks Section Header
    lv_obj_t *networksHeader = lv_obj_create(scrollArea);
    lv_obj_set_size(networksHeader, 230, 25);
    lv_obj_set_style_bg_opa(networksHeader, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(networksHeader, 0, 0);
    lv_obj_set_style_pad_all(networksHeader, 5, 0);
    lv_obj_clear_flag(networksHeader, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *availableLabel = lv_label_create(networksHeader);
    lv_label_set_text(availableLabel, "Available Networks");
    lv_obj_set_style_text_font(availableLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(availableLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(availableLabel, LV_ALIGN_LEFT_MID, 0, 0);

    // Networks container (non-scrollable, will grow as needed)
    wifiNetworksList = lv_obj_create(scrollArea);
    lv_obj_set_width(wifiNetworksList, 230);
    lv_obj_set_height(wifiNetworksList, LV_SIZE_CONTENT); // Auto-size based on content
    lv_obj_set_style_bg_color(wifiNetworksList, lv_color_hex(0x0F0F0F), 0);
    lv_obj_set_style_border_width(wifiNetworksList, 0, 0);
    lv_obj_set_style_radius(wifiNetworksList, 0, 0);
    lv_obj_set_style_pad_all(wifiNetworksList, 0, 0);
    lv_obj_set_flex_flow(wifiNetworksList, LV_FLEX_FLOW_COLUMN); // Stack networks vertically
    lv_obj_clear_flag(wifiNetworksList, LV_OBJ_FLAG_SCROLLABLE); // No internal scrolling

    // Scanning indicator
    wifiScanningLabel = lv_label_create(wifiNetworksList);
    lv_label_set_text(wifiScanningLabel, LV_SYMBOL_REFRESH " Scanning for networks...");
    lv_obj_set_style_text_color(wifiScanningLabel, lv_color_hex(0x888888), 0);
    lv_obj_set_style_text_font(wifiScanningLabel, &lv_font_montserrat_12, 0);
    lv_obj_center(wifiScanningLabel);

    // Connection progress card (initially hidden, shows when connecting)
    wifiConnectionProgress = lv_obj_create(scrollArea);
    lv_obj_set_size(wifiConnectionProgress, 230, 70);
    lv_obj_set_style_bg_color(wifiConnectionProgress, lv_color_hex(0x1A1A1A), 0);
    lv_obj_set_style_border_color(wifiConnectionProgress, lv_color_hex(0x0066CC), 0);
    lv_obj_set_style_border_width(wifiConnectionProgress, 2, 0);
    lv_obj_set_style_radius(wifiConnectionProgress, 8, 0);
    lv_obj_set_style_pad_all(wifiConnectionProgress, 12, 0);
    lv_obj_set_style_margin_bottom(wifiConnectionProgress, 5, 0);
    lv_obj_clear_flag(wifiConnectionProgress, LV_OBJ_FLAG_SCROLLABLE); // Remove scrollbars
    lv_obj_add_flag(wifiConnectionProgress, LV_OBJ_FLAG_HIDDEN);       // Initially hidden

    // Progress header with spinner
    lv_obj_t *progressHeader = lv_obj_create(wifiConnectionProgress);
    lv_obj_set_size(progressHeader, 206, 20);
    lv_obj_align(progressHeader, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(progressHeader, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(progressHeader, 0, 0);
    lv_obj_set_style_pad_all(progressHeader, 0, 0);

    // Spinner for connecting animation
    wifiConnectionSpinner = lv_spinner_create(progressHeader);
    lv_obj_set_size(wifiConnectionSpinner, 16, 16);
    lv_obj_align(wifiConnectionSpinner, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_arc_color(wifiConnectionSpinner, lv_color_hex(0x0066CC), LV_PART_MAIN);
    lv_obj_set_style_arc_color(wifiConnectionSpinner, lv_color_hex(0x0066CC), LV_PART_INDICATOR);

    // Status label (Connecting, Connected, Failed, etc.)
    lv_obj_t *statusLabel = lv_label_create(progressHeader);
    lv_label_set_text(statusLabel, "Connecting");
    lv_obj_set_style_text_font(statusLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(statusLabel, lv_color_hex(0x0066CC), 0);
    lv_obj_align(statusLabel, LV_ALIGN_LEFT_MID, 25, 0);

    // Network name and status details
    wifiConnectionLabel = lv_label_create(wifiConnectionProgress);
    lv_label_set_text(wifiConnectionLabel, "MyNetwork\nAttempting to connect...");
    lv_obj_set_style_text_color(wifiConnectionLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(wifiConnectionLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_width(wifiConnectionLabel, 206);
    lv_obj_align(wifiConnectionLabel, LV_ALIGN_TOP_LEFT, 0, 25);

    Serial.println("WiFiSettingsScreen: WiFi settings UI created with iOS/Android style");
}

void WiFiSettingsScreen::updateWiFiStatus()
{
    if (!wifiStatusLabel || !wifiService)
        return;

    // Check if we're currently connecting
    bool isConnecting = wifiService->isConnecting();

    if (isConnecting)
    {
        // Show connecting status at the top
        if (wifiCurrentNetworkCard)
        {
            lv_obj_clear_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_HIDDEN);

            // Update the card to show connecting status
            lv_obj_set_style_bg_color(wifiCurrentNetworkCard, lv_color_hex(0xFF6600), 0); // Orange for connecting
            lv_obj_set_style_border_color(wifiCurrentNetworkCard, lv_color_hex(0xFF8833), 0);
        }

        // Show connecting message
        String connectingText = "Connecting";
        if (connectingNetworkSSID.length() > 0)
        {
            connectingText += " to " + connectingNetworkSSID;
        }
        connectingText += "...";
        lv_label_set_text(wifiStatusLabel, connectingText.c_str());

        // Hide forget button during connection
        if (forgetWiFiButton)
        {
            lv_obj_add_flag(forgetWiFiButton, LV_OBJ_FLAG_HIDDEN);
        }
    }
    else if (WiFi.isConnected())
    {
        // Show connected network card
        if (wifiCurrentNetworkCard)
        {
            lv_obj_clear_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_HIDDEN);

            // Update the card to show connected status (green)
            lv_obj_set_style_bg_color(wifiCurrentNetworkCard, lv_color_hex(0x1A1A1A), 0);
            lv_obj_set_style_border_color(wifiCurrentNetworkCard, lv_color_hex(0x00AA44), 0);
        }

        // Update status with network name and IP
        String statusText = WiFi.SSID() + "\n" + WiFi.localIP().toString();
        int rssi = WiFi.RSSI();
        if (rssi >= -50)
            statusText += "\nExcellent signal";
        else if (rssi >= -60)
            statusText += "\nGood signal";
        else if (rssi >= -70)
            statusText += "\nFair signal";
        else
            statusText += "\nWeak signal";

        lv_label_set_text(wifiStatusLabel, statusText.c_str());

        // Show forget button if credentials are saved
        if (forgetWiFiButton && wifiService->hasSavedCredentials())
        {
            lv_obj_clear_flag(forgetWiFiButton, LV_OBJ_FLAG_HIDDEN);
        }
    }
    else
    {
        // Hide connected network card when disconnected
        if (wifiCurrentNetworkCard)
        {
            lv_obj_add_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_HIDDEN);
        }

        // Hide forget button when not connected
        if (forgetWiFiButton)
        {
            lv_obj_add_flag(forgetWiFiButton, LV_OBJ_FLAG_HIDDEN);
        }
    }

    // Update available networks
    updateAvailableNetworks();
}

void WiFiSettingsScreen::updateAvailableNetworks()
{
    if (!wifiNetworksList || !wifiService)
    {
        Serial.println("WiFiSettingsScreen: updateAvailableNetworks called but missing components");
        return;
    }

    Serial.printf("WiFiSettingsScreen: updateAvailableNetworks - isScanning=%d\n", wifiService->isScanning());

    // Clear current networks list (except scanning label)
    lv_obj_clean(wifiNetworksList);

    if (wifiService->isScanning())
    {
        // Show scanning indicator
        Serial.println("WiFiSettingsScreen: Still scanning, showing scanning indicator");
        wifiScanningLabel = lv_label_create(wifiNetworksList);
        lv_label_set_text(wifiScanningLabel, LV_SYMBOL_REFRESH " Scanning for networks...");
        lv_obj_set_style_text_color(wifiScanningLabel, lv_color_hex(0x888888), 0);
        lv_obj_set_style_text_font(wifiScanningLabel, &lv_font_montserrat_12, 0);
        lv_obj_center(wifiScanningLabel);
        return;
    }

    WiFiNetwork *networks = wifiService->getAvailableNetworks();
    uint8_t networkCount = wifiService->getNetworkCount();

    Serial.printf("WiFiSettingsScreen: Found %d networks to display\n", networkCount);

    if (networkCount == 0)
    {
        // No networks found
        lv_obj_t *noNetworksLabel = lv_label_create(wifiNetworksList);
        lv_label_set_text(noNetworksLabel, "No networks found\nTap refresh to scan again");
        lv_obj_set_style_text_color(noNetworksLabel, lv_color_hex(0x888888), 0);
        lv_obj_set_style_text_font(noNetworksLabel, &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_align(noNetworksLabel, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(noNetworksLabel);
        return;
    }

    // Add each network as a list item
    for (uint8_t i = 0; i < networkCount; i++)
    {
        WiFiNetwork &network = networks[i];

        // Skip current network (it's shown at the top)
        if (WiFi.isConnected() && network.ssid.equals(WiFi.SSID()))
        {
            continue;
        }

        // Create network item
        String networkText = network.ssid;

        // Add security icon for secured networks
        if (!network.isOpen)
        {
            networkText = LV_SYMBOL_WIFI " " + network.ssid + " " + LV_SYMBOL_CLOSE;
        }
        else
        {
            networkText = LV_SYMBOL_WIFI " " + network.ssid;
        }

        // Create network item as a button-like container
        lv_obj_t *networkItem = lv_obj_create(wifiNetworksList);
        lv_obj_set_width(networkItem, 220);
        lv_obj_set_height(networkItem, LV_SIZE_CONTENT);
        lv_obj_set_style_bg_color(networkItem, lv_color_hex(0x1A1A1A), LV_STATE_DEFAULT);
        lv_obj_set_style_bg_color(networkItem, lv_color_hex(0x2A2A2A), LV_STATE_PRESSED);
        lv_obj_set_style_bg_opa(networkItem, LV_OPA_COVER, 0);
        lv_obj_set_style_radius(networkItem, 6, 0);
        lv_obj_set_style_margin_bottom(networkItem, 2, 0);
        lv_obj_set_style_pad_all(networkItem, 10, 0);
        lv_obj_add_flag(networkItem, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_clear_flag(networkItem, LV_OBJ_FLAG_SCROLLABLE);

        // Network label inside the item
        lv_obj_t *networkLabel = lv_label_create(networkItem);
        lv_label_set_text(networkLabel, networkText.c_str());
        lv_obj_set_style_text_font(networkLabel, &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_color(networkLabel, lv_color_hex(0xFFFFFF), LV_STATE_DEFAULT);
        lv_obj_set_width(networkLabel, 200);
        lv_obj_align(networkLabel, LV_ALIGN_LEFT_MID, 0, 0);

        // Store network index in user data
        lv_obj_set_user_data(networkItem, (void *)(intptr_t)i);
        lv_obj_add_event_cb(networkItem, onNetworkItemClicked, LV_EVENT_CLICKED, this);

        Serial.printf("WiFiSettingsScreen: Added network %s to list\n", network.ssid.c_str());
    }
}

void WiFiSettingsScreen::refreshNetworkScan()
{
    Serial.printf("WiFiSettingsScreen: refreshNetworkScan called - wifiService=%p\n", wifiService);

    if (!wifiService)
    {
        Serial.println("WiFiSettingsScreen: ERROR - wifiService is null, cannot scan!");
        return;
    }

    Serial.println("WiFiSettingsScreen: Starting WiFi network scan");
    wifiService->scanNetworks();

    // Show scanning indicator immediately
    if (wifiNetworksList)
    {
        Serial.println("WiFiSettingsScreen: Updating UI to show scanning indicator");
        lv_obj_clean(wifiNetworksList);
        wifiScanningLabel = lv_label_create(wifiNetworksList);
        lv_label_set_text(wifiScanningLabel, LV_SYMBOL_REFRESH " Scanning for networks...");
        lv_obj_set_style_text_color(wifiScanningLabel, lv_color_hex(0x888888), 0);
        lv_obj_set_style_text_font(wifiScanningLabel, &lv_font_montserrat_12, 0);
        lv_obj_center(wifiScanningLabel);
    }
    else
    {
        Serial.println("WiFiSettingsScreen: ERROR - wifiNetworksList is null!");
    }
}

void WiFiSettingsScreen::showWiFiConnectionProgress(const String &ssid, const String &status, bool isError)
{
    if (!wifiConnectionProgress || !wifiConnectionLabel || !wifiConnectionSpinner)
        return;

    connectingNetworkSSID = ssid;

    // Update the network name and status text
    String displayText = ssid + "\n" + status;
    lv_label_set_text(wifiConnectionLabel, displayText.c_str());

    // Find and update the status label in the header
    lv_obj_t *progressHeader = lv_obj_get_child(wifiConnectionProgress, 0);
    if (progressHeader)
    {
        // Find status label (should be the second child after spinner)
        uint32_t childCount = lv_obj_get_child_cnt(progressHeader);
        for (uint32_t i = 0; i < childCount; i++)
        {
            lv_obj_t *child = lv_obj_get_child(progressHeader, i);
            if (child != wifiConnectionSpinner)
            {
                // This should be the status label
                if (isError)
                {
                    lv_label_set_text(child, "Failed");
                    lv_obj_set_style_text_color(child, lv_color_hex(0xCC0000), 0);
                }
                else if (status.indexOf("Connected") >= 0)
                {
                    lv_label_set_text(child, "Connected");
                    lv_obj_set_style_text_color(child, lv_color_hex(0x00AA44), 0);
                }
                else
                {
                    lv_label_set_text(child, "Connecting");
                    lv_obj_set_style_text_color(child, lv_color_hex(0x0066CC), 0);
                }
                break;
            }
        }
    }

    // Update border color and spinner visibility based on state
    if (isError)
    {
        lv_obj_set_style_border_color(wifiConnectionProgress, lv_color_hex(0xCC0000), 0); // Red for errors
        lv_obj_add_flag(wifiConnectionSpinner, LV_OBJ_FLAG_HIDDEN);                       // Hide spinner on error
    }
    else if (status.indexOf("Connected") >= 0)
    {
        lv_obj_set_style_border_color(wifiConnectionProgress, lv_color_hex(0x00AA44), 0); // Green for success
        lv_obj_add_flag(wifiConnectionSpinner, LV_OBJ_FLAG_HIDDEN);                       // Hide spinner when connected
    }
    else
    {
        lv_obj_set_style_border_color(wifiConnectionProgress, lv_color_hex(0x0066CC), 0); // Blue for progress
        lv_obj_clear_flag(wifiConnectionSpinner, LV_OBJ_FLAG_HIDDEN);                     // Show spinner while connecting
    }

    // Hide connected network card when showing progress
    if (wifiCurrentNetworkCard)
    {
        lv_obj_add_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_HIDDEN);
    }

    // Show the progress card
    lv_obj_clear_flag(wifiConnectionProgress, LV_OBJ_FLAG_HIDDEN);

    // Auto-hide after 3 seconds for errors, or when connection state changes for progress
    if (isError)
    {
        lv_timer_create([](lv_timer_t *timer)
                        {
            WiFiSettingsScreen *self = (WiFiSettingsScreen *)timer->user_data;
            self->hideWiFiConnectionProgress();
            lv_timer_del(timer); }, 3000, this);
    }
}

void WiFiSettingsScreen::hideWiFiConnectionProgress()
{
    if (wifiConnectionProgress)
    {
        lv_obj_add_flag(wifiConnectionProgress, LV_OBJ_FLAG_HIDDEN);
    }

    // Clear the connecting network SSID
    connectingNetworkSSID = "";

    // Cancel any existing timeout timer
    if (connectionTimeoutTimer)
    {
        lv_timer_del(connectionTimeoutTimer);
        connectionTimeoutTimer = nullptr;
    }

    // Restore normal connected network card visibility if connected
    if (WiFi.isConnected() && wifiCurrentNetworkCard)
    {
        lv_obj_clear_flag(wifiCurrentNetworkCard, LV_OBJ_FLAG_HIDDEN);
    }
}

void WiFiSettingsScreen::startConnectionTimeout(const String &ssid)
{
    // Cancel any existing timeout timer
    if (connectionTimeoutTimer)
    {
        lv_timer_del(connectionTimeoutTimer);
        connectionTimeoutTimer = nullptr;
    }

    // Create new timeout timer (15 seconds)
    connectionTimeoutTimer = lv_timer_create([](lv_timer_t *timer)
                                             {
        WiFiSettingsScreen *self = (WiFiSettingsScreen *)timer->user_data;
        
        // Show timeout error
        String *ssid = (String *)lv_timer_get_user_data(timer);
        self->showWiFiConnectionProgress(*ssid, "Connection timeout", true);
        
        // Clean up
        delete ssid;
        self->connectionTimeoutTimer = nullptr;
        lv_timer_del(timer); }, 15000, this);

    // Store SSID for timeout message
    String *ssidCopy = new String(ssid);
    lv_timer_set_user_data(connectionTimeoutTimer, ssidCopy);
}

// Event handlers
void WiFiSettingsScreen::onNetworkItemClicked(lv_event_t *e)
{
    WiFiSettingsScreen *screen = (WiFiSettingsScreen *)lv_event_get_user_data(e);
    lv_obj_t *item = (lv_obj_t *)lv_event_get_target(e);

    if (screen && screen->wifiService && item)
    {
        // Get network index from user data
        int networkIndex = (int)(intptr_t)lv_obj_get_user_data(item);
        WiFiNetwork *networks = screen->wifiService->getAvailableNetworks();
        uint8_t networkCount = screen->wifiService->getNetworkCount();

        if (networkIndex >= 0 && networkIndex < networkCount)
        {
            WiFiNetwork &selectedNetwork = networks[networkIndex];
            Serial.printf("WiFiSettingsScreen: Network selected: %s\n", selectedNetwork.ssid.c_str());

            if (selectedNetwork.isOpen)
            {
                // Open network - connect directly
                Serial.printf("WiFiSettingsScreen: Connecting to open network '%s'\n", selectedNetwork.ssid.c_str());

                // Set connecting network for visual indicator
                screen->connectingNetworkSSID = selectedNetwork.ssid;

                // Show immediate connection feedback
                screen->showWiFiConnectionProgress(selectedNetwork.ssid, "Attempting to connect...");

                // Start connection timeout
                screen->startConnectionTimeout(selectedNetwork.ssid);

                screen->wifiService->connectToNetwork(selectedNetwork.ssid, "");
                Serial.println("WiFiSettingsScreen: Connection initiated - staying on WiFi settings page");
            }
            else
            {
                // Secured network - show password dialog
                Serial.printf("WiFiSettingsScreen: Secured network '%s' selected - showing password dialog\n", selectedNetwork.ssid.c_str());
                if (screen->passwordDialog)
                {
                    screen->passwordDialog->show(selectedNetwork.ssid);
                }
            }
        }
    }
}

void WiFiSettingsScreen::onRefreshNetworksClicked(lv_event_t *e)
{
    Serial.println("WiFiSettingsScreen: onRefreshNetworksClicked callback triggered");
    WiFiSettingsScreen *screen = (WiFiSettingsScreen *)lv_event_get_user_data(e);
    if (!screen)
    {
        Serial.println("WiFiSettingsScreen: ERROR - screen pointer is null in refresh callback!");
        return;
    }

    Serial.println("WiFiSettingsScreen: Refresh networks button clicked");
    screen->refreshNetworkScan();
}

void WiFiSettingsScreen::onForgetWiFiButtonClicked(lv_event_t *e)
{
    Serial.println("WiFiSettingsScreen: Forget WiFi button clicked!");
    WiFiSettingsScreen *screen = (WiFiSettingsScreen *)lv_event_get_user_data(e);

    if (!screen)
    {
        Serial.println("WiFiSettingsScreen: ERROR - screen pointer is null!");
        return;
    }

    if (!screen->wifiService)
    {
        Serial.println("WiFiSettingsScreen: ERROR - wifiService is null!");
        return;
    }

    Serial.println("WiFiSettingsScreen: Clearing credentials and disconnecting...");

    // Clear any ongoing connection attempt
    screen->connectingNetworkSSID = "";

    screen->wifiService->clearSavedCredentials();
    screen->wifiService->disconnect();
    screen->updateWiFiStatus();
    Serial.println("WiFiSettingsScreen: WiFi credentials forgotten");
}
