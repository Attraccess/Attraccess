#pragma once

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../utils.hpp"
#include "../../images/logo_400w_png.hpp"

class EnrollmentScreen : public IScreen
{
public:
    EnrollmentScreen() : logger("EnrollmentScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    String getName() override;
    void destroy() override;

    void setEnrollmentTimeoutTime(uint32_t enrollmentTimeoutTime);
    void setUserName(String userName);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;

    lv_obj_t *timeoutBar = nullptr;
    lv_obj_t *userNameLabel = nullptr;
    String userNameCache;

    uint32_t enrollmentTimeoutTime;
    void updateTimeoutBar();
};