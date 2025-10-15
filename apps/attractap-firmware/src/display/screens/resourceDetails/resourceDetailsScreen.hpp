#pragma once

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include "../../../utils.hpp"

class ResourceDetailsScreen : public IScreen
{
public:
    enum resource_type_t
    {
        RESOURCE_TYPE_MACHINE,
        RESOURCE_TYPE_DOOR,
    };

    ResourceDetailsScreen() : logger("ResourceDetailsScreen") {}
    void init();
    void loop() override;
    lv_obj_t *getScreen() override;

    void setInfo(resource_type_t resourceType, String resourceName, String resourceDescription);
    void setInfo(resource_type_t resourceType, String resourceName, String resourceDescription, time_t sessionStartTime, String currentUser);
    void setSessionTimeoutTime(uint32_t sessionTimeoutTime);

private:
    Logger logger;
    lv_obj_t *screen;

    lv_obj_t *sessionDetailsContainer;
    time_t sessionStartTime;

    lv_obj_t *resourceName;
    lv_obj_t *resourceDescription;
    lv_obj_t *sessionStartTimeLabel;
    lv_obj_t *currentUser;
    lv_obj_t *thumbnail;

    lv_obj_t *startSessionButton;
    lv_obj_t *stopSessionButton;
    lv_obj_t *doorControls;

    lv_obj_t *flowButtonsContainer;

    void updateElapsedTimeDisplay();
    lv_obj_t *elapsedTime;

    uint32_t sessionTimeoutTime;
    lv_obj_t *sessionTimeoutIndicator;
    void updateSessionTimeoutIndicator();
};