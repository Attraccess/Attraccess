#pragma once

#include "../IScreen.hpp"
#include <functional>
#include "../../../logger/logger.hpp"
#include "../../shared/pinInput/pinInputPage.hpp"

#include <string>

class SetPinScreen : public IScreen
{
public:
    SetPinScreen() : logger("SetPinScreen") {}
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    std::string getName() override;
    void destroy() override;

    void setOnPinConfirmedCallback(std::function<void(std::string)> onPinConfirmed);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;
    PinInputPage pinInputPage;

    std::function<void(std::string)> onPinConfirmed;
};
