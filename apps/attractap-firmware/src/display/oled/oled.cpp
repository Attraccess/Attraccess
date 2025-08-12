#include "oled.hpp"

void OLED::setup()
{
    this->logger.info("Setup");

#ifdef SCREEN_DRIVER_SH1106
    uint8_t screen_init_cmd = SH1106_SWITCHCAPVCC;
#elif SCREEN_DRIVER_SSD1306
    uint8_t screen_init_cmd = SSD1306_SWITCHCAPVCC;
#endif

    // Avoid blocking during early startup
    this->screen.begin(screen_init_cmd, 0x3C);

    this->screen.clearDisplay();

    uint8_t boot_logo_width = 110;
    uint8_t boot_logo_height = 48;
    uint8_t x = (this->screen.width() - boot_logo_width) / 2;
    uint8_t y = (this->screen.height() - boot_logo_height) / 2;
    this->screen.drawBitmap(x, y, icon_boot_logo, boot_logo_width, boot_logo_height, WHITE);
    this->screen.display();

    this->logger.info("SSD1306 initialized");
    this->bootMillis = millis();
}

void OLED::transitionTo(DisplayState state)
{
    this->logger.infof("Transition to display state: %d", state);
    this->_state = state;
    this->needsUpdate = true;
}

void OLED::onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData)
{
    this->networkState = networkState;
    this->webSocketState = webSocketState;
    this->apiState = apiState;
    this->apiEventData = apiEventData;

    this->logger.debugf("onAppStateChange wifi=%d eth=%d ws=%d apiAuth=%d",
                        networkState.wifi_connected,
                        networkState.ethernet_connected,
                        webSocketState.connected,
                        apiState.authenticated);
    // Log API event only when it actually changed to avoid spam at boot
    static State::ApiEventState lastLoggedEventState = (State::ApiEventState)-1;
    static String lastLoggedEventType = "\0";
    const char *typeStr = this->apiEventData.payload["type"].is<const char *>() ? this->apiEventData.payload["type"].as<const char *>() : "";
    if (lastLoggedEventState != this->apiEventData.state || lastLoggedEventType != String(typeStr))
    {
        this->logger.infof("onApiEvent state=%d type=%s", this->apiEventData.state, typeStr);
        lastLoggedEventState = this->apiEventData.state;
        lastLoggedEventType = String(typeStr);
    }
    this->needsUpdate = true;
}

void OLED::updateScreen()
{
    if (!this->needsUpdate)
    {
        return;
    }
    // compute desired UI state from cached data
    this->_state = this->computeDesiredState();
    draw_main_elements();

    switch (this->_state)
    {
    case DISPLAY_STATE_BOOTING:
        this->draw_booting_ui();
        break;
    case DISPLAY_STATE_WAITING_FOR_NETWORK:
        this->draw_network_connecting_ui();
        break;
    case DISPLAY_STATE_WAITING_FOR_WEBSOCKET:
        this->draw_websocket_connecting_ui();
        break;
    case DISPLAY_STATE_WAITING_FOR_AUTHENTICATION:
        this->draw_authentication_ui();
        break;
    case DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT:
        this->draw_waiting_for_commands_ui();
        break;
    case DISPLAY_STATE_RESOURCE_SELECTION:
        this->draw_resource_selection_ui();
        break;
    case DISPLAY_STATE_CONFIRM_ACTION:
        this->draw_confirm_action_ui();
        break;
    case DISPLAY_STATE_WAIT_FOR_NFC_TAP:
        this->draw_nfc_tap_ui();
        break;
    case DISPLAY_STATE_SUCCESS:
        this->draw_success_ui();
        break;
    case DISPLAY_STATE_ERROR:
        this->draw_error_ui();
        break;
    case DISPLAY_STATE_TEXT:
        this->draw_text_ui();
        break;
    case DISPLAY_STATE_FIRMWARE_UPDATE:
        this->draw_firmware_update_ui();
        break;
    case DISPLAY_STATE_WAIT_FOR_PROCESSING:
        this->draw_wait_for_processing_ui();
        break;
    }

    this->screen.display();

    this->needsUpdate = false;
}

IDisplay::DisplayState OLED::computeDesiredState() const
{
    // Keep boot logo for a short duration after startup
    if (millis() < this->bootMillis + BOOT_DURATION_MS)
    {
        return DISPLAY_STATE_BOOTING;
    }

    if (!networkState.wifi_connected && !networkState.ethernet_connected)
    {
        return DISPLAY_STATE_WAITING_FOR_NETWORK;
    }
    if (!webSocketState.connected)
    {
        return DISPLAY_STATE_WAITING_FOR_WEBSOCKET;
    }
    if (!apiState.authenticated)
    {
        return DISPLAY_STATE_WAITING_FOR_AUTHENTICATION;
    }

    // Decide based on last API event
    switch (this->apiEventData.state)
    {
    case State::ApiEventState::API_EVENT_STATE_DISPLAY_ERROR:
        return DISPLAY_STATE_ERROR;
    case State::ApiEventState::API_EVENT_STATE_DISPLAY_SUCCESS:
        return DISPLAY_STATE_SUCCESS;
    case State::ApiEventState::API_EVENT_STATE_DISPLAY_TEXT:
        return DISPLAY_STATE_TEXT;
    case State::ApiEventState::API_EVENT_STATE_CONFIRM_ACTION:
        return DISPLAY_STATE_CONFIRM_ACTION;
    case State::ApiEventState::API_EVENT_STATE_RESOURCE_SELECTION:
        return DISPLAY_STATE_RESOURCE_SELECTION;
    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING:
        return DISPLAY_STATE_WAIT_FOR_PROCESSING;
    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_NFC_TAP:
        return DISPLAY_STATE_WAIT_FOR_NFC_TAP;
    case State::ApiEventState::API_EVENT_STATE_FIRMWARE_UPDATE:
        return DISPLAY_STATE_FIRMWARE_UPDATE;
    default:
        return DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT;
    }
}

void OLED::draw_booting_ui()
{
    // draw the boot logo
    uint8_t boot_logo_width = 110;
    uint8_t boot_logo_height = 48;
    uint8_t x = (this->screen.width() - boot_logo_width) / 2;
    uint8_t y = (this->screen.height() - boot_logo_height) / 2;
    this->screen.drawBitmap(x, y, icon_boot_logo, boot_logo_width, boot_logo_height, WHITE);
}

void OLED::draw_nfc_tap_ui()
{
    String lineOne = "Please tap card";
    String lineTwo = "";
    auto payload = this->apiEventData.payload;

    if (payload["type"].as<String>() == "reset-nfc-card")
    {
        JsonObject card = payload["card"].as<JsonObject>();
        uint32_t cardId = card["id"].as<uint32_t>();
        JsonObject user = payload["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        lineOne = "Reset NFC card";
        lineTwo = username + " (Card: " + String(cardId) + ")";
    }
    else if (payload["type"].as<String>() == "enroll-nfc-card")
    {
        JsonObject user = payload["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        lineOne = "Enroll NFC card";
        lineTwo = username;
    }
    else if (payload["type"].as<String>() == "toggle-resource-usage")
    {
        JsonObject resource = payload["resource"].as<JsonObject>();
        String resourceName = resource["name"].as<String>();

        // Check if there's an active usage session
        bool isActive = payload["isActive"].as<bool>();
        if (isActive)
        {
            lineOne = "Tap to stop";
            lineTwo = resourceName;
        }
        else
        {
            // Check for active maintenance
            bool hasMaintenance = payload["hasActiveMaintenance"].as<bool>();
            if (hasMaintenance)
            {
                lineOne = "Start (Maintenance)";
                lineTwo = resourceName;
            }
            else
            {
                lineOne = "Tap to start";
                lineTwo = resourceName;
            }
        }
    }
    else
    {
        // Avoid heavy String concatenations on OLED task stack; log minimal info
        const char *typeStr = payload["type"].is<const char *>() ? payload["type"].as<const char *>() : "<null>";
        this->logger.errorf("Unknown NFC tap type: %s", typeStr);
    }

    uint8_t icon_width = 64;
    uint8_t icon_height = 26;

    // calculate width and height of text
    int16_t x1, y1;
    uint16_t w, h;

    this->screen.getTextBounds(lineOne, 0, 0, &x1, &y1, &w, &h);

    uint8_t center_x = SCREEN_WIDTH / 2;
    uint8_t center_y = SCREEN_HEIGHT / 2;

    // icon first

    this->screen.drawBitmap(center_x - (icon_width / 2), center_y - (icon_height / 2) - h, icon_nfc_tap, icon_width, icon_height, WHITE);

    // text below the icon

    this->screen.setCursor(center_x - (w / 2), center_y + (icon_height / 2) - h + 5);
    this->screen.print(lineOne);

    this->screen.getTextBounds(lineTwo, 0, 0, &x1, &y1, &w, &h);
    this->screen.setCursor(center_x - (w / 2), center_y + (icon_height / 2) - h + 5 + h);
    this->screen.print(lineTwo);
}

void OLED::draw_main_elements()
{
    this->screen.clearDisplay();
    this->screen.setTextSize(1);
    this->screen.setTextColor(WHITE);

    uint8_t current_x_offset = 1;

    // wifi status
    if (this->networkState.wifi_connected)
    {
        this->screen.drawBitmap(current_x_offset, 0, icon_wifi_on, 16, 16, WHITE);
        current_x_offset += 16;
    }
    else
    {
        this->screen.drawBitmap(current_x_offset, 0, icon_wifi_off, 16, 16, WHITE);
        current_x_offset += 16;
    }

    // ethernet status
    if (this->networkState.ethernet_connected)
    {
        this->screen.drawBitmap(current_x_offset, 0, icon_ethernet, 16, 16, WHITE);
        current_x_offset += 16;
    }

    // api status, next to network status
    if (this->webSocketState.connected && this->apiState.authenticated)
    {
        this->screen.drawBitmap(current_x_offset, 0, icon_api_connected, 16, 16, WHITE);
        current_x_offset += 16;
    }
    else
    {
        this->screen.drawBitmap(current_x_offset, 0, icon_api_disconnected, 16, 16, WHITE);
        current_x_offset += 16;
    }

    // device name, top right
    int16_t x1, y1;
    uint16_t w, h;
    {
        this->screen.getTextBounds(this->apiState.deviceName, 0, 0, &x1, &y1, &w, &h);
        this->screen.setCursor(SCREEN_WIDTH - w - 1, 1);
        this->screen.print(this->apiState.deviceName);
    }
}

void OLED::draw_network_connecting_ui()
{
    this->draw_two_line_message("Network", "Connecting...");
}

void OLED::draw_websocket_connecting_ui()
{
    if (this->webSocketState.hostname.length() == 0 || this->webSocketState.port == 0)
    {
        this->draw_two_line_message("Please configure API", "hostname/port not set");
        return;
    }

    this->draw_two_line_message("Connecting", this->webSocketState.hostname + ":" + String(this->webSocketState.port));
}

void OLED::draw_authentication_ui()
{
    this->draw_two_line_message("Authenticating", this->webSocketState.hostname + ":" + String(this->webSocketState.port));
}

void OLED::draw_waiting_for_commands_ui()
{
    this->draw_two_line_message("Connected", "Waiting for commands...");
}

void OLED::draw_error_ui()
{
    JsonObject payload = this->apiEventData.payload;
    String error;
    if (payload["message"].is<String>() && !payload["message"].isNull())
    {
        error = payload["message"].as<String>();
    }
    else
    {
        // Fallback to a sane default (and avoid printing "null")
        const char *typeStr = payload["type"].is<const char *>() ? payload["type"].as<const char *>() : "";
        error = (strlen(typeStr) > 0) ? String(typeStr) : String("An error occurred");

        // log the whole payload to debug why this happens
        String payloadStr;
        serializeJson(payload, payloadStr);
        this->logger.errorf("Error payload: %s", payloadStr.c_str());
    }
    this->draw_two_line_message("Error", error);
}

void OLED::draw_success_ui()
{
    JsonObject payload = this->apiEventData.payload;
    String success = payload["message"].as<String>();
    this->draw_two_line_message("Success", success);
}

void OLED::draw_two_line_message(String line1, String line2)
{
    this->screen.setTextSize(1);
    this->screen.setTextColor(WHITE);

    int16_t x1, y1;
    uint16_t w1, h1, w2, h2;

    // Calculate bounds for the first line
    this->screen.getTextBounds(line1, 0, 0, &x1, &y1, &w1, &h1);

    // Calculate bounds for the second line
    this->screen.getTextBounds(line2, 0, 0, &x1, &y1, &w2, &h2);

    // Print first line centered
    this->screen.setCursor(SCREEN_WIDTH / 2 - w1 / 2, SCREEN_HEIGHT / 2 - h1 / 2);
    this->screen.print(line1);

    // Print second line centered
    this->screen.setCursor(SCREEN_WIDTH / 2 - w2 / 2, SCREEN_HEIGHT / 2 - h1 / 2 + h1);
    this->screen.print(line2);
}

void OLED::draw_resource_selection_ui()
{
    JsonObject payload = this->apiEventData.payload;
    String select_item_type = payload["itemType"].as<String>();

    String currentValue = State::getKeypadValue();
    this->draw_two_line_message("Select " + select_item_type, "> " + currentValue + " <");
}

void OLED::draw_text_ui()
{
    JsonObject payload = this->apiEventData.payload;
    String message = payload["message"].as<String>();

    // split by newlines, merge 2nd and all following lines
    String text_line_one = message.substring(0, message.indexOf('\n'));
    String text_line_two = message.substring(message.indexOf('\n') + 1);

    this->draw_two_line_message(text_line_one, text_line_two);
}

void OLED::draw_confirm_action_ui()
{
    String title = "Confirm";
    String message = "> not sure what... <";

    JsonObject payload = this->apiEventData.payload;

    if (payload["type"].as<String>() == "toggle-resource-usage")
    {
        String resourceName = payload["resource"]["name"].as<String>();
        bool isActive = payload["isActive"].as<bool>();

        if (isActive)
        {
            title = "Stop " + resourceName;
            message = "Confirm with \"#\"";
        }
        else
        {
            title = "Start " + resourceName;
            message = "Confirm with \"#\"";
        }
    }
    else
    {
        logger.error("UNSUPPORTED CONFIRM ACTION");
    }

    this->draw_two_line_message(title, message);
}

void OLED::draw_firmware_update_ui()
{
    this->draw_two_line_message("Updating Firmware", "Please wait...");
}

void OLED::draw_wait_for_processing_ui()
{
    this->draw_two_line_message("Processing", "Please wait...");
}

void OLED::loop()
{
    this->updateScreen();
}