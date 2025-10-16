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
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;

    void setOnPinConfirmedCallback(std::function<void(String)> onPinConfirmed);

private:
    Logger logger;
    lv_obj_t *screen;
    PinInputPage pinInputPage;

    std::function<void(String)> onPinConfirmed;
};