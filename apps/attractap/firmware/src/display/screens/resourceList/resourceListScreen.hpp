#pragma once

#include "../IScreen.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include <ArduinoJson.h>
#include <functional>
#include <string>
#include "../../../logger/logger.hpp"
#include "../../images/logo_40h.hpp"
#include <map>
#include "../../../api/api.hpp"

class ResourceListScreen : public IScreen
{
public:
    ResourceListScreen() : logger("ResourceListScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    void setResourceList(const API::ResourceList &resourceList);
    void setAuthenticated(bool authenticated);
    void setLoginUsername(const std::string &username);
    void setSessionTimeoutTime(uint32_t sessionTimeoutTime);
    void setSessionTimeoutPaused(bool paused);
    void extendSessionTimeoutBy(uint32_t ms);
    void showActionProgress(const char *text);
    void hideActionProgress();
    void setResourceDetailsCallback(std::function<void(const API::ResourceBrief &)> callback);
    void setResourceActionCallback(std::function<void(const API::ResourceBrief &)> callback);
    void setResourceActionAvailableCallback(std::function<bool(const API::ResourceBrief &)> callback);
    void setLogoutCallback(std::function<void()> callback);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;
    lv_obj_t *logo = nullptr;
    lv_obj_t *resourceContainer = nullptr;
    lv_obj_t *loginContainer = nullptr;
    lv_obj_t *loginUserLabel = nullptr;
    lv_obj_t *sessionTimeoutIndicator = nullptr;
    lv_obj_t *actionOverlay = nullptr;
    lv_obj_t *actionOverlayLabel = nullptr;
    API::ResourceList cachedResourceList{};
    bool hasCachedResourceList = false;
    bool authenticated = false;
    std::string loginUsernameCache;
    uint32_t sessionTimeoutTime = 0;
    bool sessionTimeoutPaused = false;
    uint32_t pauseFrozenAtMs = 0;

    std::function<void(const API::ResourceBrief &)> resourceDetailsCallback;
    std::function<void(const API::ResourceBrief &)> resourceActionCallback;
    std::function<bool(const API::ResourceBrief &)> resourceActionAvailableCallback;
    std::function<void()> logoutCallback;
    void addResourceListItem(const API::ResourceBrief &resource);
    void setNoResourcesMessage();
    void updateSessionTimeoutIndicator();
    static void onResourceClicked(lv_event_t *e);
    static void onLogoutClicked(lv_event_t *e);
    struct ResourceEventData
    {
        ResourceListScreen *self;
        API::ResourceBrief resource;
        bool opensDetails;
    };
    static void onContainerDelete(lv_event_t *e);
};
