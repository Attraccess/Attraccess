#pragma once

#include "../IScreen.hpp"
#include <functional>
#include "../../../logger/logger.hpp"
#include "../../shared/pinInput/pinInputPage.hpp"

#include <Arduino.h>

class SetPinScreen : public IScreen
{
public:
    SetPinScreen() : logger("SetPinScreen") {}
    void init();
    void setOnPinConfirmedCallback(std::function<void(String)> onPinConfirmed);
    lv_obj_t *getScreen() override;
    void loop() override;

private:
    Logger logger;
    lv_obj_t *screen;
    PinInputPage pinInputPage;

    std::function<void(String)> onPinConfirmed;
};