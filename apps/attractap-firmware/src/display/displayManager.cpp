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

    displayManager->display->transitionTo(IDisplay::DisplayState::DISPLAY_STATE_BOOTING);
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

    if (this->_nextState != this->_state)
    {
        this->logger.infof("Transition: %s -> %s", displayStateToString(this->_state), displayStateToString(this->_nextState));
        this->display->transitionTo(this->_nextState);
        this->_state = this->_nextState;
    }

    this->display->loop();
}

void DisplayManager::checkForAppStateChange()
{
    uint32_t lastAppStateChangeTime = State::getLastStateChangeTime();
    if (this->lastKnownAppStateChangeTime >= lastAppStateChangeTime)
    {
        return;
    }

    this->lastKnownAppStateChangeTime = lastAppStateChangeTime;

    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState webSocketState = State::getWebsocketState();
    State::ApiState apiState = State::getApiState();

    this->logger.debugf("App state changed: wifi=%d eth=%d ws=%d apiAuth=%d",
                        networkState.wifi_connected,
                        networkState.ethernet_connected,
                        webSocketState.connected,
                        apiState.authenticated);

    this->display->onAppStateChange(networkState, webSocketState, apiState);

    if (millis() < this->_bootTime + this->BOOT_DURATION_MS)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_BOOTING;
        this->logger.debug("Next display state: BOOTING (within boot duration)");
        return;
    }

    if (!networkState.wifi_connected && !networkState.ethernet_connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_NETWORK;
        this->logger.debug("Next display state: WAITING_FOR_NETWORK (no network connected)");
        return;
    }

    if (!webSocketState.connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_WEBSOCKET;
        this->logger.debug("Next display state: WAITING_FOR_WEBSOCKET (ws disconnected)");
        return;
    }

    if (!apiState.authenticated)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_AUTHENTICATION;
        this->logger.debug("Next display state: WAITING_FOR_AUTHENTICATION (API not authenticated)");
        return;
    }

    this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT;
    this->logger.debug("Next display state: CONNECTED_WAITING_FOR_API_EVENT");
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
        this->display->onApiEvent(this->apiEventData);
    }

    switch (this->apiEventData.state)
    {
    case State::ApiEventState::API_EVENT_STATE_DISPLAY_ERROR:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_ERROR;
        this->logger.debug("API event -> display: ERROR");
        break;

    case State::ApiEventState::API_EVENT_STATE_DISPLAY_SUCCESS:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_SUCCESS;
        this->logger.debug("API event -> display: SUCCESS");
        break;

    case State::ApiEventState::API_EVENT_STATE_DISPLAY_TEXT:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_TEXT;
        this->logger.debug("API event -> display: TEXT");
        break;

    case State::ApiEventState::API_EVENT_STATE_CONFIRM_ACTION:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_CONFIRM_ACTION;
        this->logger.debug("API event -> display: CONFIRM_ACTION");
        break;

    case State::ApiEventState::API_EVENT_STATE_RESOURCE_SELECTION:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_RESOURCE_SELECTION;
        this->logger.debug("API event -> display: RESOURCE_SELECTION");
        break;

    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_PROCESSING;
        this->logger.debug("API event -> display: WAIT_FOR_PROCESSING");
        break;

    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_NFC_TAP:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_NFC_TAP;
        this->logger.debug("API event -> display: WAIT_FOR_NFC_TAP");
        break;

    case State::ApiEventState::API_EVENT_STATE_FIRMWARE_UPDATE:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_FIRMWARE_UPDATE;
        this->logger.debug("API event -> display: FIRMWARE_UPDATE");
        break;

    default:
        this->logger.errorf("Unknown API event state: %d", this->apiEventData.state);
        break;
    }
}