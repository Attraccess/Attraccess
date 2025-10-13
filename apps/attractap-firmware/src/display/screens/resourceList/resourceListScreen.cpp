#include "resourceListScreen.hpp"

void ResourceListScreen::init()
{
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void ResourceListScreen::setResourceList(JsonArray resourceList)
{
   // first, remove all existing resource list items
   lv_obj_t *resourceContainer = lv_obj_get_child(this->screen, NULL);
   while (resourceContainer)
   {
      lv_obj_del(resourceContainer);
      resourceContainer = lv_obj_get_child(this->screen, NULL);
   }

   for (JsonObject resource : resourceList)
   {
      this->addResourceListItem(resource);
   }
}

void ResourceListScreen::addResourceListItem(JsonObject resource)
{
   lv_obj_t *resourceContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(resourceContainer);
   lv_obj_set_width(resourceContainer, lv_pct(100));
   lv_obj_set_height(resourceContainer, LV_SIZE_CONTENT);
   lv_obj_set_x(resourceContainer, -103);
   lv_obj_set_y(resourceContainer, -153);
   lv_obj_set_align(resourceContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resourceContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(resourceContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_add_flag(resourceContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resourceContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_radius(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(resourceContainer, lv_color_hex(0x2971CD), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(resourceContainer, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(resourceContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(resourceContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(resourceContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(resourceContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Prepare event data with a persistent copy of the resource
   // Copy resource into an independent JsonDocument to persist with the LVGL object
   JsonDocument *doc = new JsonDocument();
   doc->to<JsonObject>().set(resource);
   ResourceEventData *evt = new ResourceEventData{this, resourceContainer, doc};
   lv_obj_add_event_cb(resourceContainer, &ResourceListScreen::onResourceClicked, LV_EVENT_CLICKED, evt);
   lv_obj_add_event_cb(resourceContainer, &ResourceListScreen::onResourceClicked, LV_EVENT_DELETE, evt);

   lv_obj_t *thumbnailImage = lv_image_create(resourceContainer);
   // TODO: set source to image from api
   // lv_image_set_src(thumbnailImage, &img_lockscreen_png);
   lv_obj_set_width(thumbnailImage, 48);
   lv_obj_set_height(thumbnailImage, 48);
   lv_obj_set_align(thumbnailImage, LV_ALIGN_CENTER);
   lv_obj_remove_flag(thumbnailImage, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(thumbnailImage, LV_OBJ_FLAG_SCROLLABLE);
   lv_image_set_scale(thumbnailImage, 50);
   lv_obj_add_flag(thumbnailImage, LV_OBJ_FLAG_EVENT_BUBBLE);

   lv_obj_t *resourceLabelContainer = lv_obj_create(resourceContainer);
   lv_obj_remove_style_all(resourceLabelContainer);
   lv_obj_set_width(resourceLabelContainer, LV_SIZE_CONTENT);
   lv_obj_set_height(resourceLabelContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceLabelContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resourceLabelContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resourceLabelContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(resourceLabelContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resourceLabelContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(resourceLabelContainer, LV_OBJ_FLAG_EVENT_BUBBLE);

   lv_obj_t *resourceNameLabel = lv_label_create(resourceLabelContainer);
   lv_obj_set_width(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceNameLabel, LV_ALIGN_CENTER);
   lv_label_set_text(resourceNameLabel, resource["name"].as<String>().c_str());
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_font(resourceNameLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceNameLabel, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceNameLabel, 300, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *resourceDescriptionContainer = lv_label_create(resourceLabelContainer);
   lv_obj_set_height(resourceDescriptionContainer, 14);
   lv_obj_set_width(resourceDescriptionContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceDescriptionContainer, LV_ALIGN_CENTER);
   lv_label_set_text(resourceDescriptionContainer, resource["description"].as<String>().c_str());
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_font(resourceDescriptionContainer, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceDescriptionContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceDescriptionContainer, 300, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void ResourceListScreen::setNoResourcesMessage()
{
   lv_obj_t *noResourcesMessage = lv_label_create(this->screen);
   lv_obj_set_width(noResourcesMessage, lv_pct(100));
   lv_obj_set_height(noResourcesMessage, LV_SIZE_CONTENT);
   lv_obj_set_align(noResourcesMessage, LV_ALIGN_CENTER);
   lv_label_set_text(noResourcesMessage, "Keine Ressourcen mit diesem Reader verknüpft, bitte konfigurieren Sie den Reader in der Attraccess Administration");
   lv_obj_set_style_text_font(noResourcesMessage, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(noResourcesMessage, lv_color_hex(0xff0000), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *ResourceListScreen::getScreen()
{
   return this->screen;
}

void ResourceListScreen::loop()
{
   // nothing to do
}

void ResourceListScreen::setResourceSelectionCallback(std::function<void(JsonObject)> callback)
{
   this->resourceSelectionCallback = callback;
}

void ResourceListScreen::onResourceClicked(lv_event_t *e)
{
   ResourceEventData *evt = static_cast<ResourceEventData *>(lv_event_get_user_data(e));
   if (!evt)
      return;
   lv_event_code_t code = lv_event_get_code(e);

   if (code == LV_EVENT_CLICKED)
   {
      if (!evt->self || !evt->doc)
         return;

      if (evt->self->resourceSelectionCallback)
      {
         JsonObject res = evt->doc->as<JsonObject>();
         evt->self->logger.infof("Resource selected: %s", res["name"].as<String>().c_str());
         evt->self->resourceSelectionCallback(res);
      }
   }
   else if (code == LV_EVENT_DELETE)
   {
      // Clean up allocated event data and JSON copy
      if (evt->doc)
      {
         delete evt->doc;
         evt->doc = nullptr;
      }
      delete evt;
   }
}