#pragma once

#include "../IScreen.hpp"
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
    void setResourceSelectionCallback(std::function<void(const API::ResourceBrief &)> callback);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;
    lv_obj_t *resourceContainer = nullptr;
    API::ResourceList cachedResourceList{};
    bool hasCachedResourceList = false;

    std::function<void(const API::ResourceBrief &)> resourceSelectionCallback;
    void addResourceListItem(const API::ResourceBrief &resource);
    void setNoResourcesMessage();
    static void onResourceClicked(lv_event_t *e);
    struct ResourceEventData
    {
        ResourceListScreen *self;
        lv_obj_t *container;
        API::ResourceBrief resource;
    };
    static void onContainerDelete(lv_event_t *e);
};
