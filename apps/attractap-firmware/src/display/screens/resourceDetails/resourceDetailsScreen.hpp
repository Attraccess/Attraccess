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

    enum button_click_type_t
    {
        BUTTON_CLICK_TYPE_START_SESSION,
        BUTTON_CLICK_TYPE_STOP_SESSION,
        BUTTON_CLICK_TYPE_LOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLATCH_DOOR,
        BUTTON_CLICK_TYPE_FLOW_BUTTON,
        BUTTON_CLICK_TYPE_LOGOUT,
    };

    ResourceDetailsScreen() : logger("ResourceDetailsScreen"), loginUsernameCache("INITIAL_VALUE") {}
    void init();
    void loop() override;
    lv_obj_t *getScreen() override;
    String getName() override;

    void setResourceAndUsageDetails(resource_type_t resourceType, String resourceName, String resourceDescription);
    void setResourceAndUsageDetails(resource_type_t resourceType, String resourceName, String resourceDescription, time_t sessionStartTime, String currentUser);
    void setSessionTimeoutTime(uint32_t sessionTimeoutTime);

    struct UserDetails
    {
        String username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
    };
    void setUserDetails(UserDetails userDetails);

    struct ButtonClickEventData
    {
        ResourceDetailsScreen *self;
        button_click_type_t buttonClickType;
    };
    void setButtonClickCallback(std::function<void(ButtonClickEventData)> callback);

private:
    Logger logger;
    lv_obj_t *screen;

    String loginUsernameCache;
    lv_obj_t *loginUserLabel = nullptr;

    lv_obj_t *sessionDetailsContainer;
    time_t sessionStartTime;

    lv_obj_t *resourceName;
    lv_obj_t *resourceDescription;
    lv_obj_t *sessionStartTimeLabel;
    lv_obj_t *currentUser;

    lv_obj_t *sessionControls;

    lv_obj_t *startSessionButton;
    lv_obj_t *stopSessionButton;
    lv_obj_t *doorControls;

    lv_obj_t *flowButtonsContainer;

    void updateElapsedTimeDisplay();
    lv_obj_t *elapsedTime;

    uint32_t sessionTimeoutTime;
    lv_obj_t *sessionTimeoutIndicator;
    void updateSessionTimeoutIndicator();

    std::function<void(ButtonClickEventData)> buttonClickCallback;
    static void onButtonClick(lv_event_t *e);

    lv_obj_t *noIntroductionPanel;
    lv_obj_t *introducersListLabel;
};