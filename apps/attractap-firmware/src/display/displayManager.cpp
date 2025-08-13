#include "displayManager.hpp"

static const char *displayStateToString(IDisplay::DisplayState state)
{
    switch (state)
    {
    case IDisplay::DisplayState::DISPLAY_STATE_BOOTING:
        return "BOOTING";
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_NETWORK:
        return "WAITING_FOR_NETWORK";
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_WEBSOCKET:
        return "WAITING_FOR_WEBSOCKET";
    case IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_AUTHENTICATION:
        return "WAITING_FOR_AUTHENTICATION";
    case IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT:
        return "CONNECTED_WAITING_FOR_API_EVENT";
    case IDisplay::DisplayState::DISPLAY_STATE_TEXT:
        return "TEXT";
    case IDisplay::DisplayState::DISPLAY_STATE_SUCCESS:
        return "SUCCESS";
    case IDisplay::DisplayState::DISPLAY_STATE_ERROR:
        return "ERROR";
    case IDisplay::DisplayState::DISPLAY_STATE_CONFIRM_ACTION:
        return "CONFIRM_ACTION";
    case IDisplay::DisplayState::DISPLAY_STATE_RESOURCE_SELECTION:
        return "RESOURCE_SELECTION";
    case IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_PROCESSING:
        return "WAIT_FOR_PROCESSING";
    case IDisplay::DisplayState::DISPLAY_STATE_FIRMWARE_UPDATE:
        return "FIRMWARE_UPDATE";
    case IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_NFC_TAP:
        return "WAIT_FOR_NFC_TAP";
    default:
        return "<unknown>";
    }
}

void DisplayManager::setup()
{
    this->display->setup();

    this->logger.infof("Creating DisplayManager task with stack %u bytes", 4096u);
    xTaskCreate(DisplayManager::taskFn, "DisplayManager", 4096, this, TASK_PRIORITY_DISPLAY_MANAGER, NULL);
}

void DisplayManager::taskFn(void *parameter)
{
    DisplayManager *displayManager = (DisplayManager *)parameter;

    const uint16_t updateFreqHz = 60;
    const uint16_t updateIntervalMs = 1000 / updateFreqHz;

    displayManager->_bootTime = millis();

    displayManager->logger.info("DisplayManager task started");
    displayManager->logger.debugf("Initial state=%s", displayStateToString(IDisplay::DisplayState::DISPLAY_STATE_BOOTING));

    while (true)
    {
        displayManager->loop();
        vTaskDelay(updateIntervalMs / portTICK_PERIOD_MS);
    }
}

void DisplayManager::loop()
{
    this->checkForAppStateChange();
    this->checkForApiEvent();

    // Only notify display when something actually changed
    if (this->needsUpdate)
    {
        this->display->onDataChange(this->cachedNetworkState, this->cachedWebsocketState, this->cachedApiState, this->apiEventData);
        this->needsUpdate = false;
    }

    this->display->loop();
}

void DisplayManager::checkForAppStateChange()
{
    uint32_t lastAppStateChangeTime = State::getLastStateChangeTime();

    // Pull latest global states
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState webSocketState = State::getWebsocketState();
    State::ApiState apiState = State::getApiState();

    if (this->lastKnownAppStateChangeTime < lastAppStateChangeTime)
    {
        this->lastKnownAppStateChangeTime = lastAppStateChangeTime;
        this->cachedNetworkState = networkState;
        this->cachedWebsocketState = webSocketState;
        this->cachedApiState = apiState;

        this->logger.debugf("App state changed: wifi=%d eth=%d ws=%d apiAuth=%d",
                            networkState.wifi_connected,
                            networkState.ethernet_connected,
                            webSocketState.connected,
                            apiState.authenticated);

        this->needsUpdate = true;
    }

    // Manager no longer decides instant redraw or transitions; display computes state
    // We still keep a computed state for potential future usage/logging
    if (millis() < this->_bootTime + this->BOOT_DURATION_MS)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_BOOTING;
    }
    else if (!networkState.wifi_connected && !networkState.ethernet_connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_NETWORK;
    }
    else if (!webSocketState.connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_WEBSOCKET;
    }
    else if (!apiState.authenticated)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_AUTHENTICATION;
    }
    else
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT;
    }
}

void DisplayManager::checkForApiEvent()
{
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState webSocketState = State::getWebsocketState();
    State::ApiState apiState = State::getApiState();
    if (!(webSocketState.connected && apiState.authenticated &&
          (networkState.wifi_connected || networkState.ethernet_connected)))
    {
        return;
    }

    uint32_t lastApiEventTime = State::getLastApiEventTime();
    if (this->lastKnownApiEventTime < lastApiEventTime)
    {
        this->lastKnownApiEventTime = lastApiEventTime;
        this->apiEventData = State::getApiEventData();
        const char *typeStr = this->apiEventData.payload["type"].is<const char *>() ? this->apiEventData.payload["type"].as<const char *>() : "";
        this->logger.infof("New API event: state=%d type=%s", this->apiEventData.state, typeStr);
        this->needsUpdate = true;

        // Display will decide what to draw based on the event; manager does not transition screens here
    }
}