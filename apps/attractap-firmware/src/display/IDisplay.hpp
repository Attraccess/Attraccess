#pragma once

#include "../state/state.hpp"

class IDisplay
{
public:
    enum DisplayState
    {
        DISPLAY_STATE_BOOTING,
        DISPLAY_STATE_WAITING_FOR_NETWORK,
        DISPLAY_STATE_WAITING_FOR_WEBSOCKET,
        DISPLAY_STATE_WAITING_FOR_AUTHENTICATION,
        DISPLAY_STATE_CONNECTED_WAITING_FOR_API_EVENT, // never actually displayed, only used to trigger api event handling
        DISPLAY_STATE_RESOURCE_SELECTION,
        DISPLAY_STATE_CONFIRM_ACTION,
        DISPLAY_STATE_WAIT_FOR_NFC_TAP,
        DISPLAY_STATE_SUCCESS,
        DISPLAY_STATE_ERROR,
        DISPLAY_STATE_TEXT,
        DISPLAY_STATE_FIRMWARE_UPDATE,
        DISPLAY_STATE_WAIT_FOR_PROCESSING,
    };

    virtual void setup() = 0;
    virtual void loop() = 0;
    virtual void transitionTo(DisplayState state) = 0;
    // Notifies the display that input data changed. Implementations decide if/when to redraw.
    virtual void onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData) = 0;
};