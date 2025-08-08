#include "displayManager.hpp"

void DisplayManager::setup()
{
    this->display->setup();

    xTaskCreate(DisplayManager::taskFn, "DisplayManager", 2048, this, TASK_PRIORITY_DISPLAY_MANAGER, NULL);
}

void DisplayManager::taskFn(void *parameter)
{
    DisplayManager *displayManager = (DisplayManager *)parameter;

    const uint16_t updateFreqHz = 60;
    const uint16_t updateIntervalMs = 1000 / updateFreqHz;

    displayManager->_bootTime = millis();

    displayManager->display->transitionTo(IDisplay::DisplayState::DISPLAY_STATE_BOOTING);

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

    this->display->onAppStateChange(networkState, webSocketState, apiState);

    if (millis() < this->_bootTime + this->BOOT_DURATION_MS)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_BOOTING;
        return;
    }

    if (!networkState.wifi_connected && !networkState.ethernet_connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_NETWORK;
        return;
    }

    if (!webSocketState.connected)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_WEBSOCKET;
        return;
    }

    if (!apiState.authenticated)
    {
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAITING_FOR_AUTHENTICATION;
        return;
    }

    this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT;
}

void DisplayManager::checkForApiEvent()
{
    if (this->_nextState != IDisplay::DisplayState::DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT)
    {
        return;
    }

    uint32_t lastApiEventTime = State::getLastApiEventTime();
    if (this->lastKnownApiEventTime <= lastApiEventTime)
    {
        this->lastKnownApiEventTime = lastApiEventTime;
        this->apiEventData = State::getApiEventData();
        this->display->onApiEvent(this->apiEventData);
    }

    switch (this->apiEventData.state)
    {
    case State::ApiEventState::API_EVENT_STATE_DISPLAY_ERROR:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_ERROR;
        break;

    case State::ApiEventState::API_EVENT_STATE_DISPLAY_SUCCESS:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_SUCCESS;
        break;

    case State::ApiEventState::API_EVENT_STATE_DISPLAY_TEXT:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_TEXT;
        break;

    case State::ApiEventState::API_EVENT_STATE_CONFIRM_ACTION:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_CONFIRM_ACTION;
        break;

    case State::ApiEventState::API_EVENT_STATE_RESOURCE_SELECTION:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_RESOURCE_SELECTION;
        break;

    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_PROCESSING;
        break;

    case State::ApiEventState::API_EVENT_STATE_WAIT_FOR_NFC_TAP:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_WAIT_FOR_NFC_TAP;
        break;

    case State::ApiEventState::API_EVENT_STATE_FIRMWARE_UPDATE:
        this->_nextState = IDisplay::DisplayState::DISPLAY_STATE_FIRMWARE_UPDATE;
        break;

    default:
        this->logger.errorf("Unknown API event state: %d", this->apiEventData.state);
        break;
    }
}