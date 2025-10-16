#pragma once

#include "../IScreen.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include <ArduinoJson.h>
#include <functional>
#include "../../../logger/logger.hpp"
#include "../../images/logo_400w_png.hpp"
#include <map>

class ResourceListScreen : public IScreen
{
public:
    ResourceListScreen() : logger("ResourceListScreen") {}
    void init();
    void loop() override;
    lv_obj_t *getScreen() override;
    String getName() override;

    void setResourceList(JsonArray resourceList);
    void setResourceSelectionCallback(std::function<void(JsonObject)> callback);
    void setResourceImage(uint32_t resourceId, uint16_t w, uint16_t h, const uint8_t *data, size_t len);

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
        lv_obj_t *thumbnailImage;
        lv_image_dsc_t *imgDesc;
    };
    static void onContainerDelete(lv_event_t *e);
    std::map<uint32_t, ResourceEventData *> resourceIdToEvent;
};