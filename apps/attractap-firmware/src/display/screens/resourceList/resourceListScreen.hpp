#pragma once

#include "../IScreen.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include <ArduinoJson.h>
#include <functional>
#include "../../../logger/logger.hpp"

class ResourceListScreen : public IScreen
{
public:
    ResourceListScreen() : logger("ResourceListScreen") {}
    void init();
    void loop() override;
    lv_obj_t *getScreen() override;
    void setResourceList(JsonArray resourceList);
    void setResourceSelectionCallback(std::function<void(JsonObject)> callback);

private:
    Logger logger;
    lv_obj_t *screen;
    std::function<void(JsonObject)> resourceSelectionCallback;
    void addResourceListItem(JsonObject resource);
    void setNoResourcesMessage();
    static void onResourceClicked(lv_event_t *e);
    struct ResourceEventData
    {
        ResourceListScreen *self;
        lv_obj_t *container;
        JsonDocument *doc;
    };
};