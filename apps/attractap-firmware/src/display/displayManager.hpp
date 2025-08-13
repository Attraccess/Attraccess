#pragma once

#include "IDisplay.hpp"
#include "../state/state.hpp"
#include "../logger/logger.hpp"
#include "task_priorities.h"

class DisplayManager
{
public:
    DisplayManager(IDisplay *display)
        : display(display),
          logger("DisplayManager"),
          _bootTime(millis()),
          _state(IDisplay::DisplayState::DISPLAY_STATE_BOOTING),
          _nextState(IDisplay::DisplayState::DISPLAY_STATE_BOOTING),
          lastKnownAppStateChangeTime(0),
          lastKnownApiEventTime(0),
          needsUpdate(true),
          cachedNetworkState({}),
          cachedWebsocketState({}),
          cachedApiState({})
    {
    }

    void setup();

private:
    Logger logger;

    static void taskFn(void *parameter);
    void loop();

    uint32_t _bootTime;
    const uint32_t BOOT_DURATION_MS = 2000;

    IDisplay *display;
    IDisplay::DisplayState _state;
    IDisplay::DisplayState _nextState;

    uint32_t lastKnownAppStateChangeTime;
    void checkForAppStateChange();

    State::ApiEventData apiEventData;
    uint32_t lastKnownApiEventTime;
    void checkForApiEvent();

    bool needsUpdate;
    State::NetworkState cachedNetworkState;
    State::WebsocketState cachedWebsocketState;
    State::ApiState cachedApiState;
};