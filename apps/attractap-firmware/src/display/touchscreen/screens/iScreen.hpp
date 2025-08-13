#pragma once

#include <lvgl.h>
#include "state/state.hpp"

class IScreen
{
public:
    IScreen() {}

    virtual void onScreenEnter() = 0;
    virtual void onScreenExit() = 0;
    virtual void loop() = 0;
    virtual lv_obj_t *getScreen() = 0;
    virtual void onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData) {}
};